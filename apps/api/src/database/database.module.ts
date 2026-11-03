import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createPrismaClient, type Prisma, type PrismaClient } from '@medtravel/db';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Injection token for the Prisma client. */
export const PRISMA = Symbol('PRISMA');

/** Listeners told about every slow query (the metrics counter). */
export const slowQueryListeners = new Set<() => void>();

/** A client or the transaction client handed to `$transaction` callbacks: services accept either. */
export type Db = Prisma.TransactionClient;

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * One PrismaClient (and connection pool) for the whole API, closed on shutdown. Global because every module that
 * touches data needs it.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [ENV],
      useFactory: (env: Env): PrismaClient => {
        const logger = new Logger('SlowQuery');
        return createPrismaClient({
          connectionString: env.DATABASE_URL,
          slowQueryMs: env.SLOW_QUERY_MS,
          // The SQL text only (values are separate parameters and are never given to us), cut short.
          onSlowQuery: ({ sql, durationMs }) => {
            logger.warn(`${durationMs} ms: ${sql.replace(/\s+/g, ' ').slice(0, 300)}`);
            for (const listener of slowQueryListeners) listener();
          },
        });
      },
    },
    DatabaseShutdown,
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}
