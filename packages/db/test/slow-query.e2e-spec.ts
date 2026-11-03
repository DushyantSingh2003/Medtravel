import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/client.ts';

/** The slow-query hook against a real database: it reports the SQL and the time, never the values. */

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must point at a PostgreSQL server');

describe('slow query logging', () => {
  const seen: { sql: string; durationMs: number }[] = [];
  const prisma = createPrismaClient({
    connectionString: url,
    slowQueryMs: 40,
    onSlowQuery: (query) => seen.push(query),
  });
  afterAll(() => prisma.$disconnect());

  it('reports a query over the threshold, with its text and no values', async () => {
    await prisma.$queryRaw`SELECT pg_sleep(0.08)::text AS slept, ${'asha@example.com'}::text AS who`;
    const slow = seen.find((q) => q.sql.includes('pg_sleep'));
    expect(slow).toBeDefined();
    expect(slow?.durationMs).toBeGreaterThanOrEqual(40);
    expect(slow?.sql).toContain('$1');
    expect(JSON.stringify(seen)).not.toContain('asha@example.com');
  });

  it('says nothing about fast queries', async () => {
    seen.length = 0;
    await prisma.$queryRaw`SELECT 1`;
    expect(seen).toEqual([]);
  });
});
