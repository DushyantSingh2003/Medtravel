import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@medtravel/db';
import { money } from '@medtravel/contracts';
import {
  RateUnavailableError,
  StaticProvider,
  convert,
  rateOn,
  snapshotRate,
  storeRates,
  type FxProvider,
} from '@medtravel/fx';
import { FxScheduler } from '../src/fx/fx.module.js';
import { FX_SCHEDULER_ID, FX_TIME_ZONE, ratesAreStale, runFxRefresh } from '../src/fx/fx.job.js';

/** Exchange rates against a real database: the daily job, the lookups quotes depend on, and the schedule in Redis. */

const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://medtravel:medtravel@localhost:5432/medtravel';
const dbName = `worker_${randomBytes(4).toString('hex')}`;
const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};
let admin: PrismaClient;
let prisma: PrismaClient;
const day = (text: string) => new Date(`${text}T00:00:00.000Z`);

beforeAll(async () => {
  admin = createPrismaClient({ connectionString: baseUrl });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], {
    cwd: new URL('../../../packages/db', import.meta.url),
    env: { ...process.env, DATABASE_URL: urlFor(dbName) },
    stdio: 'pipe',
  });
  prisma = createPrismaClient({ connectionString: urlFor(dbName) });
  await prisma.currency.createMany({
    data: [
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
      { code: 'AED', name: 'UAE dirham', minorUnits: 2 },
      { code: 'EUR', name: 'Euro', minorUnits: 2 },
      { code: 'JPY', name: 'Yen', minorUnits: 0 },
      { code: 'KWD', name: 'Dinar', minorUnits: 3 },
      { code: 'XTS', name: 'Retired currency', minorUnits: 2, active: false },
    ],
  });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin?.$disconnect();
});

describe('the daily refresh', () => {
  it('stores today’s rate for every active currency against USD, and a second run changes nothing', async () => {
    const provider = new StaticProvider(() => new Date('2026-10-29T00:40:00Z'));
    const first = await runFxRefresh({ prisma, provider });
    expect(first).toMatchObject({ stored: 5, currencies: 5 });
    const rows = await prisma.fxRate.findMany({ orderBy: { quoteCurrency: 'asc' } });
    expect(rows.map((r) => r.quoteCurrency)).toEqual(['AED', 'EUR', 'INR', 'JPY', 'KWD']);
    expect(rows.every((r) => r.baseCurrency === 'USD' && r.source === 'static')).toBe(true);
    expect(rows.find((r) => r.quoteCurrency === 'INR')?.rate.toString()).toBe('83.25');
    expect(rows[0]?.asOf.toISOString()).toBe('2026-10-29T00:00:00.000Z');

    expect((await runFxRefresh({ prisma, provider })).stored).toBe(0);
    expect(await prisma.fxRate.count()).toBe(5);
  });

  it('keeps the old rates when the provider fails', async () => {
    const failing: FxProvider = {
      name: 'broken',
      fetchRates: async () => Promise.reject(new Error('provider down')),
    };
    await expect(runFxRefresh({ prisma, provider: failing })).rejects.toThrow('provider down');
    expect(await prisma.fxRate.count()).toBe(5);
  });

  it('says whether the newest rate is more than a day old', async () => {
    expect(await ratesAreStale(prisma, new Date('2026-10-29T06:00:00Z'))).toBe(false);
    expect(await ratesAreStale(prisma, new Date('2026-10-31T06:00:00Z'))).toBe(true);
  });
});

describe('looking up a rate', () => {
  const on = new Date('2026-10-29T10:00:00Z');

  it('finds a direct rate, its inverse, and a cross rate through USD, and says which', async () => {
    const direct = await rateOn(prisma, 'USD', 'INR', on);
    expect(direct).toMatchObject({ rate: '83.25000000', how: 'direct', source: 'static' });
    const inverse = await rateOn(prisma, 'INR', 'USD', on);
    expect(inverse).toMatchObject({ rate: '0.01201201', how: 'inverse' });
    const cross = await rateOn(prisma, 'INR', 'AED', on);
    expect(cross).toMatchObject({ rate: '0.04411411', how: 'pivot', source: 'static' });
    expect(await rateOn(prisma, 'INR', 'INR', on)).toMatchObject({
      rate: '1.00000000',
      how: 'identity',
    });
  });

  it('uses the newest rate not after the date asked about, never a later one', async () => {
    await storeRates(prisma, {
      base: 'USD',
      asOf: day('2026-10-30'),
      source: 'test',
      rates: { INR: '90' },
    });
    expect((await rateOn(prisma, 'USD', 'INR', day('2026-10-29'))).rate).toBe('83.25000000');
    expect((await rateOn(prisma, 'USD', 'INR', new Date('2026-10-30T09:00:00Z'))).rate).toBe(
      '90.00000000',
    );
  });

  it('refuses a rate older than three days, or a currency with none, instead of guessing', async () => {
    await expect(rateOn(prisma, 'USD', 'AED', day('2026-11-05'))).rejects.toBeInstanceOf(
      RateUnavailableError,
    );
    await expect(rateOn(prisma, 'USD', 'XTS', on)).rejects.toThrow(/No recent exchange rate/);
    await expect(rateOn(prisma, 'USD', 'AED', day('2026-10-01'))).rejects.toBeInstanceOf(
      RateUnavailableError,
    );
  });
});

describe('converting', () => {
  const on = new Date('2026-10-29T10:00:00Z');

  it('converts a price into INR, AED and back, in whole minor units', async () => {
    expect((await convert(prisma, money(150000, 'USD'), 'INR', on)).money).toEqual(
      money(12487500, 'INR'),
    );
    expect((await convert(prisma, money(150000, 'USD'), 'AED', on)).money).toEqual(
      money(550875, 'AED'),
    );
    expect((await convert(prisma, money(12487500, 'INR'), 'USD', on)).money.amountMinor).toBe(
      150000,
    );
    expect((await convert(prisma, money(150000, 'USD'), 'USD', on)).money).toEqual(
      money(150000, 'USD'),
    );
  });

  it('respects each currency’s decimals from the master (yen has none, dinar has three)', async () => {
    expect((await convert(prisma, money(10000, 'USD'), 'JPY', on)).money).toEqual(
      money(15040, 'JPY'),
    );
    expect((await convert(prisma, money(10000, 'USD'), 'KWD', on)).money).toEqual(
      money(30700, 'KWD'),
    );
  });

  it('gives a quote the fields to remember the rate it used', async () => {
    expect(await snapshotRate(prisma, 'USD', 'INR', on)).toEqual({
      fxRate: '83.25000000',
      fxRateAt: day('2026-10-29'),
      fxSource: 'static',
      fxBaseCurrency: 'USD',
    });
  });
});

describe('the schedule', () => {
  it('registers a job that runs every day at 06:00 India time, once however many workers start', async () => {
    const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const queue = new Queue(`fx-test-${randomBytes(3).toString('hex')}`, { connection });
    try {
      const scheduler = new FxScheduler(queue, prisma, { FX_REFRESH_CRON: '0 6 * * *' });
      await scheduler.onApplicationBootstrap();
      await scheduler.onApplicationBootstrap();
      const schedulers = await queue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0]).toMatchObject({
        key: FX_SCHEDULER_ID,
        pattern: '0 6 * * *',
        tz: FX_TIME_ZONE,
        name: 'refresh',
      });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
      connection.disconnect();
    }
  });
});
