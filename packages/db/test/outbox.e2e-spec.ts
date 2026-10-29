import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../src/client.ts';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_VISIBILITY_TIMEOUT_MS,
  claimOutboxBatch,
  outboxBackoffMs,
  processOutbox,
  type OutboxEventRecord,
} from '../src/outbox.ts';

/** The outbox runtime against a real database: claiming, retries with backoff, giving up, and several workers at once. */

const baseUrl = process.env['DATABASE_URL'];
if (!baseUrl)
  throw new Error('DATABASE_URL must point at a PostgreSQL server that allows CREATE DATABASE');

const dbName = `outbox_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

let admin: PrismaClient;
let prisma: PrismaClient;

const publish = (type: string, key?: string, createdAt?: Date) =>
  prisma.outboxEvent.create({
    data: {
      type,
      aggregateType: 'Test',
      aggregateId: randomBytes(4).toString('hex'),
      payload: { n: 1 },
      ...(createdAt ? { createdAt } : {}),
      ...(key ? { dedupeKey: key } : {}),
    },
  });

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

beforeEach(async () => {
  await prisma.outboxEvent.deleteMany();
});

describe('outbox runtime', () => {
  it('hands each due event to its handler once, oldest first, and marks it processed', async () => {
    const seen: string[] = [];
    const first = await publish('a.happened', undefined, new Date(Date.now() - 2000));
    const second = await publish('b.happened', undefined, new Date(Date.now() - 1000));
    const result = await processOutbox(prisma, {
      'a.happened': async (event) => void seen.push(event.id),
      'b.happened': async (event) => void seen.push(event.id),
    });
    expect(result).toEqual({ claimed: 2, processed: 2, retried: 0, failed: 0 });
    expect(seen).toEqual([first.id, second.id]);
    const rows = await prisma.outboxEvent.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows.map((row) => row.status)).toEqual(['processed', 'processed']);
    expect(rows.every((row) => row.processedAt !== null && row.attempts === 1)).toBe(true);
    expect((await processOutbox(prisma, {})).claimed).toBe(0);
  });

  it('marks an event with no handler processed, so it does not wait for ever', async () => {
    await publish('nobody.listens');
    expect((await processOutbox(prisma, {})).processed).toBe(1);
  });

  it('never gives the same event to two workers claiming at the same moment', async () => {
    for (let i = 0; i < 12; i += 1) await publish('x');
    const claims = await Promise.all(Array.from({ length: 4 }, () => claimOutboxBatch(prisma, 5)));
    const ids = claims.flat().map((event) => event.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('puts a failed event back with a growing delay, and runs it again when it is due', async () => {
    const event = await publish('flaky');
    let calls = 0;
    const handlers = {
      flaky: async () => {
        calls += 1;
        if (calls < 3) throw new Error(`boom ${calls}`);
      },
    };
    const t0 = new Date();
    expect(await processOutbox(prisma, handlers, { now: t0 })).toMatchObject({ retried: 1 });
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastError: 'boom 1' });
    expect(row.availableAt.getTime()).toBeGreaterThanOrEqual(
      t0.getTime() + outboxBackoffMs(1) - 1000,
    );

    // Not due yet: nothing happens.
    expect(
      (await processOutbox(prisma, handlers, { now: new Date(t0.getTime() + 1000) })).claimed,
    ).toBe(0);

    const t1 = new Date(t0.getTime() + outboxBackoffMs(1) + 1000);
    expect(await processOutbox(prisma, handlers, { now: t1 })).toMatchObject({ retried: 1 });
    const t2 = new Date(t1.getTime() + outboxBackoffMs(2) + 1000);
    expect(await processOutbox(prisma, handlers, { now: t2 })).toMatchObject({ processed: 1 });
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({ status: 'processed', attempts: 3, lastError: null });
    expect(calls).toBe(3);
  });

  it('gives up after the last try and keeps the reason, without the payload', async () => {
    const event = await publish('hopeless');
    let now = new Date();
    let last = { failed: 0 };
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i += 1) {
      last = await processOutbox(
        prisma,
        {
          hopeless: async () => {
            throw new Error('still broken');
          },
        },
        { now },
      );
      now = new Date(now.getTime() + 20 * 60_000);
    }
    expect(last.failed).toBe(1);
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row).toMatchObject({
      status: 'failed',
      attempts: OUTBOX_MAX_ATTEMPTS,
      lastError: 'still broken',
    });
    expect((await processOutbox(prisma, {}, { now })).claimed).toBe(0);
  });

  it('lets another worker take an event whose worker died, once its lock has run out', async () => {
    const event = await publish('orphan');
    const t0 = new Date();
    expect(await claimOutboxBatch(prisma, 5, t0)).toHaveLength(1);
    expect(await claimOutboxBatch(prisma, 5, new Date(t0.getTime() + 1000))).toHaveLength(0);
    const later = new Date(t0.getTime() + OUTBOX_VISIBILITY_TIMEOUT_MS + 1000);
    const again = await claimOutboxBatch(prisma, 5, later);
    expect(again.map((e: OutboxEventRecord) => e.id)).toEqual([event.id]);
    expect(again[0]?.attempts).toBe(2);
  });

  it('refuses a second event with the same dedupe key', async () => {
    await publish('once', 'incident:1');
    await expect(publish('once', 'incident:1')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not let a worker that lost its lock overwrite the outcome of the one that took over', async () => {
    const event = await publish('race');
    const t0 = new Date();
    const [first] = await claimOutboxBatch(prisma, 1, t0);
    const [second] = await claimOutboxBatch(
      prisma,
      1,
      new Date(t0.getTime() + OUTBOX_VISIBILITY_TIMEOUT_MS + 1000),
    );
    expect(first?.id).toBe(event.id);
    expect(second?.attempts).toBe(2);
    const { completeOutbox } = await import('../src/outbox.ts');
    if (!first || !second) throw new Error('claims');
    await completeOutbox(prisma, first);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'processing',
    );
    await completeOutbox(prisma, second);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'processed',
    );
  });
});

describe('outboxBackoffMs', () => {
  it('doubles from five seconds and stops at fifteen minutes', () => {
    expect([1, 2, 3, 4].map(outboxBackoffMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(outboxBackoffMs(20)).toBe(15 * 60_000);
  });
});
