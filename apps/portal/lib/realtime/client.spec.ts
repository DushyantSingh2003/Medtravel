import { describe, expect, it, vi } from 'vitest';
import type { RealtimeMessage } from '@medtravel/contracts';
import { RealtimeClient, backoffDelay, type SocketLike } from './client';

class FakeSocket implements SocketLike {
  connected = false;
  handlers = new Map<string, (...args: unknown[]) => void>();
  sent: { event: string; args: unknown[] }[] = [];
  connects = 0;
  on(event: string, listener: (...args: never[]) => void) {
    this.handlers.set(event, listener as never);
    return this;
  }
  /** Acknowledgement callbacks of what was sent, in order; a test answers them when the server would. */
  acks: { event: string; answer: (value: unknown) => void }[] = [];
  emit(event: string, ...args: unknown[]) {
    this.sent.push({ event, args });
    const ack = args.at(-1);
    if (typeof ack === 'function')
      this.acks.push({ event, answer: ack as (value: unknown) => void });
    return this;
  }
  /** Answers every outstanding join (or other) acknowledgement. */
  answer(event: string, value: unknown = { ok: true }) {
    for (const ack of this.acks.filter((entry) => entry.event === event)) ack.answer(value);
    this.acks = this.acks.filter((entry) => entry.event !== event);
  }
  connect() {
    this.connects += 1;
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  fire(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }
  open() {
    this.connected = true;
    this.fire('connect');
  }
  sentOf(event: string) {
    return this.sent.filter((entry) => entry.event === event).map((entry) => entry.args[0]);
  }
}

const message = (
  id: string,
  at: string,
  event: RealtimeMessage['event'] = 'case.updated',
): RealtimeMessage => ({
  id,
  at,
  event,
  room: 'case:c1',
  payload: { caseId: 'c1' },
});

function setup(refresh: () => Promise<'ok' | 'signed_out' | 'error'> = async () => 'ok') {
  const socket = new FakeSocket();
  const timers: { callback: () => void; ms: number }[] = [];
  const client = new RealtimeClient({
    createSocket: () => socket,
    refreshSession: refresh,
    random: () => 1,
    setTimer: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  client.start();
  return { socket, client, timers };
}

describe('backoffDelay', () => {
  it('doubles from one second to a ceiling of thirty, with jitter between half and all of it', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map((attempt) => backoffDelay(attempt, () => 1))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(backoffDelay(3, () => 0)).toBe(4000);
    expect(backoffDelay(0, () => 0.5)).toBe(750);
  });
});

describe('RealtimeClient', () => {
  it('hands each event to the listeners once, even when it arrives twice', () => {
    const { socket, client } = setup();
    const heard: string[] = [];
    client.subscribe((m) => heard.push(m.id));
    socket.open();
    socket.fire('event', message('a', '2026-10-29T12:00:00.000Z'));
    socket.fire('event', message('a', '2026-10-29T12:00:00.000Z'));
    socket.fire('event', message('b', '2026-10-29T12:00:01.000Z'));
    expect(heard).toEqual(['a', 'b']);
  });

  it('joins a room once however many screens ask, and leaves when the last one is done', () => {
    const { socket, client } = setup();
    socket.open();
    const leaveFirst = client.join('case', 'c1');
    const leaveSecond = client.join('case', 'c1');
    expect(socket.sentOf('join')).toEqual([{ kind: 'case', id: 'c1' }]);
    leaveFirst();
    expect(socket.sentOf('leave')).toEqual([]);
    leaveSecond();
    expect(socket.sentOf('leave')).toEqual([{ kind: 'case', id: 'c1' }]);
  });

  it('joins the rooms asked for before the connection was up, as soon as it is', () => {
    const { socket, client } = setup();
    client.join('hospital', 'h1');
    expect(socket.sentOf('join')).toEqual([]);
    socket.open();
    expect(socket.sentOf('join')).toEqual([{ kind: 'hospital', id: 'h1' }]);
  });

  it('after a reconnect rejoins its rooms, waits for the answers, then asks for what it missed since the last event; not on the first connection', async () => {
    const { socket, client } = setup();
    client.join('case', 'c1');
    socket.open();
    expect(socket.sentOf('sync')).toEqual([]);
    socket.fire('event', message('a', '2026-10-29T12:00:00.000Z'));
    socket.fire('event', message('b', '2026-10-29T12:05:00.000Z'));
    socket.fire('event', message('old', '2026-10-29T11:00:00.000Z'));
    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    socket.sent.length = 0;
    socket.open();
    expect(socket.sentOf('join')).toEqual([{ kind: 'case', id: 'c1' }]);
    // The server replays only the rooms the socket is in by then: asking before the join is answered would miss the case room.
    expect(socket.sentOf('sync')).toEqual([]);
    socket.answer('join');
    await vi.waitFor(() =>
      expect(socket.sentOf('sync')).toEqual([{ since: '2026-10-29T12:05:00.000Z' }]),
    );
  });

  it('tells listeners to refetch when the server says too much was missed', () => {
    const { socket, client } = setup();
    const resync = vi.fn();
    client.onResync(resync);
    socket.open();
    socket.fire('resync');
    expect(resync).toHaveBeenCalledOnce();
  });

  it('gets a fresh session and reconnects when the server drops an expired one, backing off each time', async () => {
    const refresh = vi.fn(async () => 'ok' as const);
    const { socket, timers } = setup(refresh);
    socket.open();
    socket.fire('disconnect', 'io server disconnect');
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0]?.callback();
    await vi.waitFor(() => expect(socket.connects).toBe(1));
    expect(refresh).toHaveBeenCalledOnce();
    // The connection is refused again: the next wait is longer.
    socket.fire('connect_error', { message: 'unauthorized' });
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000]);
  });

  it('stops trying when the person is signed out', async () => {
    const { socket, timers } = setup(async () => 'signed_out');
    socket.fire('connect_error', { message: 'unauthorized' });
    timers[0]?.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(socket.connects).toBe(0);
  });

  it('does not touch the session for a network failure, which Socket.IO retries by itself', () => {
    const refresh = vi.fn(async () => 'ok' as const);
    const { socket, timers } = setup(refresh);
    socket.fire('connect_error', { message: 'websocket error' });
    expect(timers).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('tries again later when the API cannot say whether the person is signed in', async () => {
    const outcomes: ('error' | 'ok')[] = ['error', 'ok'];
    const refresh = vi.fn(async () => outcomes.shift() ?? 'ok');
    const { socket, timers } = setup(refresh);
    socket.fire('connect_error', { message: 'unauthorized' });
    timers[0]?.callback();
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect(socket.connects).toBe(0);
    timers[1]?.callback();
    await vi.waitFor(() => expect(socket.connects).toBe(1));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores a late report from a socket it has closed, even after starting again', () => {
    const sockets: FakeSocket[] = [];
    const timers: (() => void)[] = [];
    const client = new RealtimeClient({
      createSocket: () => {
        const created = new FakeSocket();
        sockets.push(created);
        return created;
      },
      refreshSession: async () => 'ok',
      setTimer: (callback) => timers.push(callback),
      clearTimer: () => undefined,
    });
    client.start();
    client.close();
    client.start();
    sockets[0]?.fire('connect_error', { message: 'unauthorized' });
    sockets[0]?.fire('event', message('late', '2026-10-29T12:00:00.000Z'));
    expect(timers).toEqual([]);
  });

  it('forgets the oldest event ids past its limit, so memory stays bounded', () => {
    const { socket, client } = setup();
    const heard: string[] = [];
    client.subscribe((m) => heard.push(m.id));
    for (let i = 0; i < 520; i += 1)
      socket.fire('event', message(`e${i}`, '2026-10-29T12:00:00.000Z'));
    socket.fire('event', message('e0', '2026-10-29T12:00:00.000Z'));
    socket.fire('event', message('e519', '2026-10-29T12:00:00.000Z'));
    // e0 was forgotten (heard again); e519 is still remembered (not heard again).
    expect(heard.filter((id) => id === 'e0')).toHaveLength(2);
    expect(heard.filter((id) => id === 'e519')).toHaveLength(1);
  });

  it('resets the backoff once connected, and says what it does when typing', () => {
    const { socket, client, timers } = setup();
    socket.fire('connect_error', { message: 'unauthorized' });
    timers[0]?.callback();
    socket.open();
    socket.fire('connect_error', { message: 'unauthorized' });
    expect(timers.map((t) => t.ms)).toEqual([1000, 1000]);
    client.sendTyping('c1', true);
    expect(socket.sentOf('typing')).toEqual([{ caseId: 'c1', typing: true }]);
  });

  it('sends nothing while disconnected, and nothing after close', () => {
    const { socket, client } = setup();
    client.sendTyping('c1', true);
    expect(socket.sentOf('typing')).toEqual([]);
    client.close();
    expect(client.connected).toBe(false);
  });
});

describe('RealtimeClient restart', () => {
  it('can be started again after close, as React strict mode does, keeping the rooms screens asked for', () => {
    const sockets: FakeSocket[] = [];
    const client = new RealtimeClient({
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      refreshSession: async () => 'ok',
    });
    client.join('case', 'c1');
    client.start();
    client.close();
    client.start();
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(sockets[1]?.sentOf('join')).toEqual([{ kind: 'case', id: 'c1' }]);
    expect(client.connected).toBe(true);
  });
});
