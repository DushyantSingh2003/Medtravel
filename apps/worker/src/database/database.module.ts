import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Injection token for the Prisma client. */
export const PRISMA = Symbol('PRISMA');

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/** One PrismaClient for the worker, closed on shutdown. */
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
          onSlowQuery: ({ sql, durationMs }) =>
            logger.warn(`${durationMs} ms: ${sql.replace(/\s+/g, ' ').slice(0, 300)}`),
        });
      },
    },
    DatabaseShutdown,
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}
