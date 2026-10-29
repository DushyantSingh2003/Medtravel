import type { RealtimeMessage, RoomKind } from '@medtravel/contracts';

/** The part of a Socket.IO client the realtime client uses; a fake stands in for it in tests. */
export interface SocketLike {
  connected: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

export interface RealtimeClientOptions {
  createSocket: () => SocketLike;
  /** Gets a fresh session cookie (the REST client refreshes it on its own when it has expired). Resolves false when signed out. */
  refreshSession: () => Promise<boolean>;
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

type Listener = (message: RealtimeMessage) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const SEEN_LIMIT = 500;

/** Exponential backoff with jitter: 1 s, 2 s, 4 s ... up to 30 s, each between half and all of that. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

const roomKey = (kind: RoomKind, id: string) => `${kind}:${id}`;

/**
 * One connection to the realtime gateway for the whole portal. It joins the rooms screens ask for (and rejoins them after a
 * reconnect), hands each event to the listeners once, remembers the time of the last event so a reconnect can ask for what it
 * missed, and reconnects with backoff, getting a fresh session first when the server dropped it for an expired one.
 */
export class RealtimeClient {
  private socket: SocketLike | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly resyncListeners = new Set<() => void>();
  private readonly rooms = new Map<string, { kind: RoomKind; id: string; count: number }>();
  private readonly seen: string[] = [];
  private readonly seenSet = new Set<string>();
  private lastSeen: string | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closed = false;
  private hasConnected = false;

  constructor(private readonly options: RealtimeClientOptions) {}

  start(): void {
    if (this.socket) return;
    // Starting again after `close()` is allowed: React strict mode runs an effect, cleans it up, and runs it again.
    this.closed = false;
    this.attempt = 0;
    const socket = this.options.createSocket();
    this.socket = socket;
    socket.on('connect', () => void this.onConnect());
    socket.on('event', ((message: RealtimeMessage) => this.onEvent(message)) as never);
    socket.on('resync', (() => this.resyncListeners.forEach((listener) => listener())) as never);
    socket.on('session_expired', (() => this.reconnectLater(true)) as never);
    socket.on('connect_error', (() => this.reconnectLater(true)) as never);
    socket.on('disconnect', ((reason: string) => {
      // The server closed it (expired session): Socket.IO does not retry that by itself. A network drop it retries by itself.
      if (reason === 'io server disconnect') this.reconnectLater(true);
    }) as never);
  }

  close(): void {
    this.closed = true;
    if (this.timer) (this.options.clearTimer ?? clearTimeout)(this.timer as never);
    this.timer = null;
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Calls the listener for each event pushed to this browser (once per event, even if it arrives twice). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Calls the listener when the server says too much was missed to replay: refetch what is on screen. */
  onResync(listener: () => void): () => void {
    this.resyncListeners.add(listener);
    return () => this.resyncListeners.delete(listener);
  }

  /** Joins a room (once, however many screens ask); the returned function leaves it when the last screen is done. */
  join(kind: RoomKind, id: string): () => void {
    const key = roomKey(kind, id);
    const existing = this.rooms.get(key);
    if (existing) existing.count += 1;
    else {
      this.rooms.set(key, { kind, id, count: 1 });
      if (this.socket?.connected) this.socket.emit('join', { kind, id }, () => undefined);
    }
    return () => {
      const room = this.rooms.get(key);
      if (!room) return;
      room.count -= 1;
      if (room.count > 0) return;
      this.rooms.delete(key);
      if (this.socket?.connected) this.socket.emit('leave', { kind, id }, () => undefined);
    };
  }

  /** Tells the others in the case room whether this person is typing. */
  sendTyping(caseId: string, typing: boolean): void {
    if (this.socket?.connected) this.socket.emit('typing', { caseId, typing }, () => undefined);
  }

  get connected(): boolean {
    return this.socket?.connected === true;
  }

  private async onConnect(): Promise<void> {
    this.attempt = 0;
    const socket = this.socket;
    if (!socket) return;
    for (const room of this.rooms.values())
      socket.emit('join', { kind: room.kind, id: room.id }, () => undefined);
    // Back after being away: ask for what happened meanwhile (the first connection has nothing to catch up on).
    if (this.hasConnected && this.lastSeen)
      socket.emit('sync', { since: this.lastSeen }, () => undefined);
    this.hasConnected = true;
  }

  private onEvent(message: RealtimeMessage): void {
    if (this.seenSet.has(message.id)) return;
    this.seenSet.add(message.id);
    this.seen.push(message.id);
    if (this.seen.length > SEEN_LIMIT) this.seenSet.delete(this.seen.shift() as string);
    if (!this.lastSeen || Date.parse(message.at) > Date.parse(this.lastSeen))
      this.lastSeen = message.at;
    for (const listener of this.listeners) listener(message);
  }

  private reconnectLater(refresh: boolean): void {
    if (this.closed || this.timer) return;
    const delay = backoffDelay(this.attempt, this.options.random);
    this.attempt += 1;
    this.timer = (this.options.setTimer ?? setTimeout)(() => {
      this.timer = null;
      void (async () => {
        if (this.closed) return;
        // Signed out: stop trying until the page is loaded again signed in.
        if (refresh && !(await this.options.refreshSession())) return;
        this.socket?.connect();
      })();
    }, delay);
  }
}
