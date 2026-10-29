import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
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
      useFactory: (env: Env): PrismaClient =>
        createPrismaClient({ connectionString: env.DATABASE_URL }),
    },
    DatabaseShutdown,
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}
