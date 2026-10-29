import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FrankfurterProvider,
  OpenExchangeRatesProvider,
  STATIC_USD_RATES,
  StaticProvider,
  createFxProvider,
} from './providers.js';

let server: Server;
let base = '';
let seen: { url: string; headers: Record<string, string | string[] | undefined> }[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push({ url: request.url ?? '', headers: request.headers });
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('Frankfurter', () => {
  it('asks for the pivot against the quotes and returns exact decimal strings for the publication day', async () => {
    seen = [];
    reply = {
      status: 200,
      body: { date: '2026-10-29', base: 'USD', rates: { INR: 83.2512, AED: 3.6725, EUR: 0.92 } },
    };
    const result = await new FrankfurterProvider({ baseUrl: base }).fetchRates('USD', [
      'INR',
      'AED',
      'EUR',
    ]);
    expect(seen[0]?.url).toBe('/latest?from=USD&to=INR,AED,EUR');
    expect(result.asOf.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(result.rates).toEqual({ INR: '83.25120000', AED: '3.67250000', EUR: '0.92000000' });
  });

  it('fails, leaving the stored rates alone, on an error answer, a missing currency or a malformed body', async () => {
    const provider = new FrankfurterProvider({ baseUrl: base });
    reply = { status: 503, body: {} };
    await expect(provider.fetchRates('USD', ['INR'])).rejects.toThrow(/503/);
    reply = { status: 200, body: { date: '2026-10-29', rates: { INR: 83 } } };
    await expect(provider.fetchRates('USD', ['INR', 'AED'])).rejects.toThrow(/no rate for AED/);
    reply = { status: 200, body: { nope: true } };
    await expect(provider.fetchRates('USD', ['INR'])).rejects.toThrow();
  });
});

describe('Open Exchange Rates', () => {
  it('sends the app id as a header, not in the address, and reads the timestamp', async () => {
    seen = [];
    reply = { status: 200, body: { timestamp: 1793275200, rates: { INR: 83.1, AED: 3.6725 } } };
    const result = await new OpenExchangeRatesProvider({
      appId: 'secret-id',
      baseUrl: base,
    }).fetchRates('USD', ['INR', 'AED']);
    expect(seen[0]?.url).toBe('/api/latest.json?base=USD&symbols=INR,AED');
    expect(seen[0]?.url).not.toContain('secret-id');
    expect(seen[0]?.headers['authorization']).toBe('Token secret-id');
    expect(result.asOf.toISOString()).toBe('2026-10-29T12:00:00.000Z');
    expect(result.rates['INR']).toBe('83.10000000');
  });
});

describe('the static table and the factory', () => {
  it('gives cross rates against any listed base, for today', async () => {
    const provider = new StaticProvider(() => new Date('2026-10-29T10:20:30Z'));
    const fromUsd = await provider.fetchRates('USD', ['INR', 'AED']);
    expect(fromUsd.asOf.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(fromUsd.rates).toEqual({ INR: '83.25000000', AED: '3.67250000' });
    const fromInr = await provider.fetchRates('INR', ['USD']);
    expect(fromInr.rates['USD']).toBe('0.01201201');
    await expect(provider.fetchRates('USD', ['XXX'])).rejects.toThrow(/No static rate/);
    expect(Object.keys(STATIC_USD_RATES)).toEqual(
      expect.arrayContaining(['INR', 'USD', 'AED', 'EUR']),
    );
  });

  it('builds the provider the settings name, and insists on a key for the paid one', () => {
    expect(createFxProvider({ provider: 'static' }).name).toBe('static');
    expect(createFxProvider({ provider: 'frankfurter' }).name).toBe('frankfurter');
    expect(
      createFxProvider({ provider: 'openexchangerates', openExchangeRatesAppId: 'k' }).name,
    ).toBe('openexchangerates');
    expect(() => createFxProvider({ provider: 'openexchangerates' })).toThrow(
      /OPEN_EXCHANGE_RATES_APP_ID/,
    );
  });
});
