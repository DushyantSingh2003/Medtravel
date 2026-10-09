import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export type { Prisma } from '../generated/prisma/client.ts';
export { PrismaClient };

/** Everything the database connection needs. Validated by each app's own config schema. */
export interface DatabaseOptions {
  /** PostgreSQL connection string, e.g. postgresql://user:pass@host:5432/db?schema=public */
  connectionString: string;
  /** Log every query. Useful locally; never enable in production — queries carry PII. */
  logQueries?: boolean;
}

/**
 * Build a PrismaClient on the pg driver adapter.
 *
 * Prisma 7 no longer reads the connection URL from the schema, so the URL is passed in by
 * the caller, which keeps `packages/db` free of environment handling and lets tests point
 * at a throwaway database.
 */
export function createPrismaClient(options: DatabaseOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

let singleton: PrismaClient | undefined;

/**
 * Process-wide client, so Next.js dev reloads and the worker do not open a new pool on
 * every hot reload. Apps that manage their own lifecycle (the Nest API) should call
 * `createPrismaClient` instead and let the DI container own it.
 */
export function getPrismaClient(options: DatabaseOptions): PrismaClient {
  singleton ??= createPrismaClient(options);
  return singleton;
}

/** Close the shared client, if one was created. Used by tests and graceful shutdown. */
export async function disconnectPrismaClient(): Promise<void> {
  if (singleton) {
    await singleton.$disconnect();
    singleton = undefined;
  }
}
