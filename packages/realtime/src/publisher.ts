import { randomUUID } from 'node:crypto';
import {
  REALTIME_LOG_SECONDS,
  REALTIME_LOG_SIZE,
  realtimePayloadSchemas,
  type RealtimeEventName,
  type RealtimeMessage,
  type RealtimePayload,
} from '@medtravel/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import type { Redis } from 'ioredis';

const logKey = (room: string) => `rt:log:${room}`;

/**
 * Sends events to rooms from any process: the API (which holds the sockets) and the worker (which does not). It emits through
 * Redis, where every API instance's adapter picks the event up and delivers it to the sockets it holds, and it keeps a short
 * log per room so a client that was offline can catch up.
 */
export class RealtimePublisher {
  private readonly emitter: Emitter;

  constructor(private readonly redis: Redis) {
    this.emitter = new Emitter(redis);
  }

  /** Validates the payload (ids only), logs the event and delivers it to everyone in the room. */
  async publish<E extends RealtimeEventName>(
    room: string,
    event: E,
    payload: RealtimePayload<E>,
    options: { except?: string } = {},
  ): Promise<RealtimeMessage> {
    const parsed = realtimePayloadSchemas[event].parse(payload) as Record<string, unknown>;
    const message: RealtimeMessage = {
      id: randomUUID(),
      room,
      event,
      at: new Date().toISOString(),
      payload: parsed,
    };
    const key = logKey(room);
    await this.redis
      .multi()
      .lpush(key, JSON.stringify(message))
      .ltrim(key, 0, REALTIME_LOG_SIZE - 1)
      .expire(key, REALTIME_LOG_SECONDS)
      .exec();
    const target = options.except
      ? this.emitter.to(room).except(options.except)
      : this.emitter.to(room);
    target.emit('event', message);
    return message;
  }

  /**
   * Events in these rooms newer than `since`, oldest first. `truncated` is true when the log no longer reaches back to
   * `since` (it holds only the last hour and 200 events a room), so the client must refetch everything instead.
   */
  async missed(
    rooms: readonly string[],
    since: Date,
  ): Promise<{ events: RealtimeMessage[]; truncated: boolean }> {
    const events: RealtimeMessage[] = [];
    let truncated = false;
    if (Date.now() - since.getTime() > REALTIME_LOG_SECONDS * 1000) truncated = true;
    for (const room of rooms) {
      const raw = await this.redis.lrange(logKey(room), 0, REALTIME_LOG_SIZE - 1);
      const logged = raw.map((line) => JSON.parse(line) as RealtimeMessage);
      // Newest first: if even the oldest kept event is newer than `since` and the log is full, older ones were dropped.
      const oldest = logged.at(-1);
      if (oldest && logged.length >= REALTIME_LOG_SIZE && Date.parse(oldest.at) > since.getTime())
        truncated = true;
      for (const message of logged)
        if (Date.parse(message.at) > since.getTime()) events.push(message);
    }
    events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { events, truncated };
  }
}
