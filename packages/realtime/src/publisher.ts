import { randomUUID } from 'node:crypto';
import {
  REALTIME_LOG_SECONDS,
  REALTIME_LOG_SIZE,
  realtimeMessageSchema,
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
  /** Publishes the emitter has started and not yet finished, so a failure can be awaited instead of lost. */
  private pending: Promise<unknown>[] = [];

  constructor(private readonly redis: Redis) {
    // The emitter fires its Redis publish and forgets it; tracking it here lets `publish` wait for it and report a failure.
    const tracked = {
      publish: (...args: Parameters<Redis['publish']>) => {
        const result = redis.publish(...args);
        this.pending.push(result);
        return result;
      },
    } as unknown as Redis;
    this.emitter = new Emitter(tracked);
  }

  /**
   * Validates the payload (ids only), logs the event and delivers it to everyone in the room. Resolves once Redis has taken the
   * event; rejects if it has not, so the outbox retries. `options.id` names the event (the outbox event id): a retry logs it
   * once and sends it with the same id, which browsers drop as a duplicate.
   */
  async publish<E extends RealtimeEventName>(
    room: string,
    event: E,
    payload: RealtimePayload<E>,
    options: { except?: string; id?: string } = {},
  ): Promise<RealtimeMessage> {
    const parsed = realtimePayloadSchemas[event].parse(payload) as Record<string, unknown>;
    const message: RealtimeMessage = {
      id: options.id ?? randomUUID(),
      room,
      event,
      at: new Date().toISOString(),
      payload: parsed,
    };
    const key = logKey(room);
    const firstTime =
      !options.id ||
      (await this.redis.set(`rt:sent:${options.id}`, '1', 'EX', REALTIME_LOG_SECONDS, 'NX')) ===
        'OK';
    if (firstTime)
      await this.redis
        .multi()
        .lpush(key, JSON.stringify(message))
        .ltrim(key, 0, REALTIME_LOG_SIZE - 1)
        .expire(key, REALTIME_LOG_SECONDS)
        .exec();
    this.pending = [];
    const target = options.except
      ? this.emitter.to(room).except(options.except)
      : this.emitter.to(room);
    target.emit('event', message);
    await Promise.all(this.pending);
    return message;
  }

  /**
   * Events in these rooms at or after `since`, oldest first (the browser drops the one it already has by id). `truncated` is
   * true when the log no longer reaches back to `since` (it holds only the last hour and 200 events a room), so the client
   * must refetch everything instead. Log lines that are not valid events are ignored.
   */
  async missed(
    rooms: readonly string[],
    since: Date,
  ): Promise<{ events: RealtimeMessage[]; truncated: boolean }> {
    const events: RealtimeMessage[] = [];
    let truncated = Date.now() - since.getTime() > REALTIME_LOG_SECONDS * 1000;
    for (const room of rooms) {
      const raw = await this.redis.lrange(logKey(room), 0, REALTIME_LOG_SIZE - 1);
      const logged: RealtimeMessage[] = [];
      for (const line of raw) {
        try {
          const parsed = realtimeMessageSchema.safeParse(JSON.parse(line));
          // A line is trusted only if it is a well-formed event for this very room.
          if (parsed.success && parsed.data.room === room) logged.push(parsed.data);
        } catch {
          // not JSON: ignore
        }
      }
      // Newest first: if even the oldest kept event is newer than `since` and the log is full, older ones were dropped.
      const oldest = logged.at(-1);
      if (oldest && raw.length >= REALTIME_LOG_SIZE && Date.parse(oldest.at) > since.getTime())
        truncated = true;
      for (const message of logged)
        if (Date.parse(message.at) >= since.getTime()) events.push(message);
    }
    events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return { events, truncated };
  }
}
