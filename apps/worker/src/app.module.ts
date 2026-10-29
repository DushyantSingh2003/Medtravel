import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.schema.js';
import { StorageModule } from './storage/storage.module.js';
import { DatabaseModule } from './database/database.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: { paths: ['*.password', '*.otp', '*.token'], censor: '[redacted]' },
          ...(env.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        // Native ESM: BullMQ cannot lazy-load ioredis from connection options, so hand it a
        // constructed client. maxRetriesPerRequest must be null for blocking worker commands.
        connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: { age: 3_600, count: 1_000 },
          removeOnFail: { age: 24 * 3_600 },
        },
      }),
    }),
    DatabaseModule,
    StorageModule,
    OutboxModule,
    NotificationsModule,
  ],
})
export class AppModule {}
