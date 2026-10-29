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
  /**
   * Gets a fresh session cookie (the REST client refreshes it on its own when it has expired). `signed_out` only when the API
   * says the person is not signed in; `error` for anything else (a network failure, a deploy in progress): worth retrying.
   */
  refreshSession: () => Promise<'ok' | 'signed_out' | 'error'>;
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

type Listener = (message: RealtimeMessage) => void;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const SEEN_LIMIT = 500;
const ACK_TIMEOUT_MS = 5000;

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
    // Everything a socket reports is ignored once it is no longer the current one (after `close()`, or a restart).
    const current = <A extends unknown[]>(handler: (...args: A) => void) =>
      ((...args: A) => {
        if (this.socket === socket) handler(...args);
      }) as never;
    socket.on(
      'connect',
      current(() => void this.onConnect()),
    );
    socket.on(
      'event',
      current((message: RealtimeMessage) => this.onEvent(message)),
    );
    socket.on(
      'resync',
      current(() => this.resyncListeners.forEach((listener) => listener())),
    );
    socket.on(
      'session_expired',
      current(() => this.reconnectLater(true)),
    );
    // Only a refused session needs our help; a network failure is retried by Socket.IO itself, with its own backoff.
    socket.on(
      'connect_error',
      current((error: { message?: string }) => {
        if (error?.message === 'unauthorized') this.reconnectLater(true);
      }),
    );
    socket.on(
      'disconnect',
      current((reason: string) => {
        // The server closed it (expired session): Socket.IO does not retry that by itself. A network drop it retries by itself.
        if (reason === 'io server disconnect') this.reconnectLater(true);
      }),
    );
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

  /** Sends a message and waits for the server's answer (or gives up after a few seconds). */
  private ask(socket: SocketLike, event: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      const give = (this.options.setTimer ?? setTimeout)(() => resolve(undefined), ACK_TIMEOUT_MS);
      socket.emit(event, payload, (answer: unknown) => {
        (this.options.clearTimer ?? clearTimeout)(give as never);
        resolve(answer);
      });
    });
  }

  private async onConnect(): Promise<void> {
    this.attempt = 0;
    const socket = this.socket;
    if (!socket) return;
    // Rejoin first and wait for every answer: the server replays only the rooms the socket is in when it asks.
    await Promise.all(
      [...this.rooms.values()].map((room) =>
        this.ask(socket, 'join', { kind: room.kind, id: room.id }),
      ),
    );
    if (this.socket !== socket) return;
    // Back after being away: ask for what happened meanwhile (the first connection has nothing to catch up on).
    if (this.hasConnected && this.lastSeen)
      await this.ask(socket, 'sync', { since: this.lastSeen });
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
        if (refresh) {
          const outcome = await this.options.refreshSession();
          // Signed out: stop trying until the page is loaded again signed in.
          if (outcome === 'signed_out') return;
          // The API could not say (a network failure, a deploy): try again later, with a longer wait.
          if (outcome === 'error') return this.reconnectLater(true);
        }
        this.socket?.connect();
      })();
    }, delay);
  }
}
