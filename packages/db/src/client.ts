import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

export { Prisma } from '../generated/prisma/client.ts';
export { PrismaClient };

/** Everything the database connection needs. Validated by each app's own config schema. */
export interface DatabaseOptions {
  /** PostgreSQL connection string, e.g. postgresql://user:pass@host:5432/db?schema=public */
  connectionString: string;
  /** Log every query. Useful locally; never enable in production — queries carry PII. */
  logQueries?: boolean;
  /** Called for every query slower than `slowQueryMs`, with the SQL text (placeholders, never the values) and how long it took. */
  onSlowQuery?: (query: { sql: string; durationMs: number }) => void;
  /** The threshold for `onSlowQuery`. Default 200 ms. */
  slowQueryMs?: number;
}

export const DEFAULT_SLOW_QUERY_MS = 200;

/**
 * Build a PrismaClient on the pg driver adapter.
 *
 * Prisma 7 no longer reads the connection URL from the schema, so the URL is passed in by
 * the caller, which keeps `packages/db` free of environment handling and lets tests point
 * at a throwaway database.
 */
export function createPrismaClient(options: DatabaseOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  const { onSlowQuery } = options;
  // Events instead of console output when someone listens for slow queries; the values of a query are never passed on.
  const client = new PrismaClient({
    adapter,
    log: [
      ...(options.logQueries ? [{ emit: 'stdout' as const, level: 'query' as const }] : []),
      ...(onSlowQuery ? [{ emit: 'event' as const, level: 'query' as const }] : []),
      { emit: 'stdout' as const, level: 'warn' as const },
      { emit: 'stdout' as const, level: 'error' as const },
    ],
  });
  if (onSlowQuery) {
    const threshold = options.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
    (
      client as unknown as {
        $on(event: 'query', run: (e: { query: string; duration: number }) => void): void;
      }
    ).$on('query', (event) => {
      if (event.duration >= threshold)
        onSlowQuery({ sql: event.query, durationMs: event.duration });
    });
  }
  return client;
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
