import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fxConvertedSchema, fxRatesSchema } from '@medtravel/contracts';
import { storeRates } from '@medtravel/fx';
import { createTestApp, type TestApp } from './support/test-app.js';

let t: TestApp;
const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

beforeAll(async () => {
  t = await createTestApp();
  await t.db.currency.createMany({
    data: [
      { code: 'USD', name: 'US dollar', minorUnits: 2 },
      { code: 'INR', name: 'Indian rupee', minorUnits: 2 },
      { code: 'AED', name: 'UAE dirham', minorUnits: 2 },
      { code: 'JPY', name: 'Yen', minorUnits: 0 },
      { code: 'GBP', name: 'Pound', minorUnits: 2 },
    ],
  });
  await storeRates(t.db, {
    base: 'USD',
    asOf: today,
    source: 'test',
    rates: { INR: '83.25', AED: '3.6725', JPY: '150.4' },
  });
});

afterAll(async () => {
  await t.close();
});

describe('GET /fx/rates', () => {
  it('is open to visitors who are not signed in, and lists every currency that has a rate', async () => {
    const res = await t.call(null, 'GET', '/fx/rates');
    expect(res.status).toBe(200);
    const body = fxRatesSchema.parse(res.body);
    expect(body.base).toBe('USD');
    expect(body.rates).toEqual({
      INR: '83.25000000',
      AED: '3.67250000',
      JPY: '150.40000000',
    });
  });

  it('quotes from another currency through the dollar, and is cacheable', async () => {
    const res = await t.raw('GET', '/fx/rates?base=inr');
    expect(res.status).toBe(200);
    const body = fxRatesSchema.parse(res.body);
    expect(body.base).toBe('INR');
    expect(body.rates['USD']).toBe('0.01201201');
    expect(body.rates['AED']).toBe('0.04411411');
    expect(String(res.headers['cache-control'])).toContain('max-age=300');
  });

  it('rejects a malformed currency code', async () => {
    expect((await t.call(null, 'GET', '/fx/rates?base=rupee')).status).toBe(400);
  });

  it('says so when it has no rates for a currency', async () => {
    expect((await t.call(null, 'GET', '/fx/rates?base=GBP')).status).toBe(400);
  });
});

describe('GET /fx/convert', () => {
  it('converts a price to rupees and dirhams in whole minor units', async () => {
    const inr = await t.call(null, 'GET', '/fx/convert?amountMinor=150000&from=USD&to=INR');
    expect(inr.status).toBe(200);
    expect(fxConvertedSchema.parse(inr.body).to).toEqual({
      amountMinor: 12487500,
      currency: 'INR',
    });
    const aed = await t.call(null, 'GET', '/fx/convert?amountMinor=150000&from=USD&to=AED');
    expect(fxConvertedSchema.parse(aed.body).to).toEqual({ amountMinor: 550875, currency: 'AED' });
  });

  it('uses the currency’s own decimals', async () => {
    const res = await t.call(null, 'GET', '/fx/convert?amountMinor=10000&from=USD&to=JPY');
    expect(fxConvertedSchema.parse(res.body).to).toEqual({ amountMinor: 15040, currency: 'JPY' });
  });

  it('refuses a currency with no recent rate rather than guessing', async () => {
    const res = await t.call(null, 'GET', '/fx/convert?amountMinor=100&from=USD&to=GBP');
    expect(res.status).toBe(400);
  });

  it('refuses a rate for a date too far from any stored rate', async () => {
    const res = await t.call(
      null,
      'GET',
      '/fx/convert?amountMinor=100&from=USD&to=INR&date=2000-01-01',
    );
    expect(res.status).toBe(400);
  });

  it('validates the amount and the codes', async () => {
    expect((await t.call(null, 'GET', '/fx/convert?amountMinor=1.5&from=USD&to=INR')).status).toBe(
      400,
    );
    expect((await t.call(null, 'GET', '/fx/convert?amountMinor=1&from=US&to=INR')).status).toBe(
      400,
    );
  });

  it('limits how often one address may ask', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 70; i += 1)
      statuses.push(
        (await t.raw('GET', '/fx/convert?amountMinor=1&from=USD&to=INR', { ip: '203.0.113.9' }))
          .status,
      );
    expect(statuses).toContain(429);
  });
});
