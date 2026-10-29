import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { RealtimeEventName, RealtimePayload } from '@medtravel/contracts';
import { RealtimePublisher } from '@medtravel/realtime';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { connectRedis } from './redis.js';
import { Logger } from '@nestjs/common';

/** Publishing and catching up, over Redis. The gateway holds the sockets; this holds the log. */
@Injectable()
export class RealtimeService implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly redis;
  readonly publisher: RealtimePublisher;

  constructor(@Inject(ENV) env: Env) {
    this.redis = connectRedis(env.REDIS_URL, (message) => this.logger.warn(message));
    this.publisher = new RealtimePublisher(this.redis);
  }

  /** Sends an event to everyone in a room now. Business code should queue `enqueueRealtime` in its transaction instead. */
  publish<E extends RealtimeEventName>(room: string, event: E, payload: RealtimePayload<E>) {
    return this.publisher.publish(room, event, payload);
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
