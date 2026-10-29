import { Global, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { RealtimePublisher } from '@medtravel/realtime';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Injection token for the publisher that pushes events to browsers through Redis. */
export const REALTIME_PUBLISHER = Symbol('REALTIME_PUBLISHER');
const REALTIME_REDIS = Symbol('REALTIME_REDIS');

class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REALTIME_REDIS) private readonly redis: Redis) {}
  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REALTIME_REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
        // A Redis outage must not crash the worker: the outbox retries the push.
        redis.on('error', () => undefined);
        return redis;
      },
    },
    {
      provide: REALTIME_PUBLISHER,
      inject: [REALTIME_REDIS],
      useFactory: (redis: Redis) => new RealtimePublisher(redis),
    },
    RedisShutdown,
  ],
  exports: [REALTIME_PUBLISHER],
})
export class RealtimeModule {}
