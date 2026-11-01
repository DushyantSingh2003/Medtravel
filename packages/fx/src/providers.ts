import { z } from 'zod';
import { numberToRate } from './decimal.js';

export interface FetchedRates {
  /** When the provider says the rates are from. */
  asOf: Date;
  /** Units of each quote currency per one unit of the base. */
  rates: Record<string, string>;
}

export interface FxProvider {
  readonly name: string;
  fetchRates(base: string, quotes: readonly string[]): Promise<FetchedRates>;
}

type Fetch = typeof fetch;

/** A provider that does not answer must fail the job so it retries, not hold it forever. */
const FETCH_TIMEOUT_MS = 15_000;

async function json(response: Response, what: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  return response.json();
}

function pick(
  rates: Record<string, number>,
  quotes: readonly string[],
  what: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  // A currency the provider does not quote (the ECB has no dirham) is left out, not an error: the others still refresh.
  for (const quote of quotes) {
    const value = rates[quote];
    if (value !== undefined) result[quote] = numberToRate(value);
  }
  if (Object.keys(result).length === 0)
    throw new Error(`${what} has no rate for any of ${quotes.join(', ')}`);
  return result;
}

/** The European Central Bank's reference rates through frankfurter.app: free, no key, updated on working days. */
export class FrankfurterProvider implements FxProvider {
  readonly name = 'frankfurter';
  constructor(private readonly options: { baseUrl?: string; fetch?: Fetch } = {}) {}

  async fetchRates(base: string, quotes: readonly string[]): Promise<FetchedRates> {
    const url = `${this.options.baseUrl ?? 'https://api.frankfurter.app'}/latest?from=${base}`;
    const body = z.object({ date: z.string(), rates: z.record(z.string(), z.number()) }).parse(
      await json(
        await (this.options.fetch ?? fetch)(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }),
        'Frankfurter',
      ),
    );
    // The ECB publishes once a day around 16:00 CET: the rates are valid from that day's publication.
    return {
      asOf: new Date(`${body.date}T00:00:00.000Z`),
      rates: pick(body.rates, quotes, 'Frankfurter'),
    };
  }
}

/** Open Exchange Rates (needs an app id; the free plan has USD as its only base). */
export class OpenExchangeRatesProvider implements FxProvider {
  readonly name = 'openexchangerates';
  constructor(private readonly options: { appId: string; baseUrl?: string; fetch?: Fetch }) {}

  async fetchRates(base: string, quotes: readonly string[]): Promise<FetchedRates> {
    const url = `${this.options.baseUrl ?? 'https://openexchangerates.org'}/api/latest.json?base=${base}&symbols=${quotes.join(',')}`;
    const response = await (this.options.fetch ?? fetch)(url, {
      headers: { authorization: `Token ${this.options.appId}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = z
      .object({ timestamp: z.number(), rates: z.record(z.string(), z.number()) })
      .parse(await json(response, 'Open Exchange Rates'));
    return {
      asOf: new Date(body.timestamp * 1000),
      rates: pick(body.rates, quotes, 'Open Exchange Rates'),
    };
  }
}

/** Fixed rates for development and tests (roughly the 2026 market, rounded). Refused in production by the environment check. */
export const STATIC_USD_RATES: Record<string, string> = {
  AED: '3.67250000',
  EUR: '0.92000000',
  GBP: '0.79000000',
  INR: '83.25000000',
  IQD: '1310.00000000',
  JPY: '150.40000000',
  KES: '129.00000000',
  KWD: '0.30700000',
  NGN: '1550.00000000',
  OMR: '0.38500000',
  SAR: '3.75000000',
  USD: '1.00000000',
  UZS: '12700.00000000',
};

export class StaticProvider implements FxProvider {
  readonly name = 'static';
  constructor(private readonly now: () => Date = () => new Date()) {}

  async fetchRates(base: string, quotes: readonly string[]): Promise<FetchedRates> {
    const baseRate = STATIC_USD_RATES[base];
    if (!baseRate) throw new Error(`No static rate for ${base}`);
    const rates: Record<string, string> = {};
    for (const quote of quotes) {
      const quoteRate = STATIC_USD_RATES[quote];
      if (!quoteRate) continue;
      // quote per base = (quote per USD) / (base per USD)
      rates[quote] = numberToRate(Number(quoteRate) / Number(baseRate));
    }
    if (Object.keys(rates).length === 0)
      throw new Error(`No static rate for any of ${quotes.join(', ')}`);
    const day = this.now();
    return {
      asOf: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
      rates,
    };
  }
}

export type FxProviderName = 'static' | 'frankfurter' | 'openexchangerates';

export function createFxProvider(config: {
  provider: FxProviderName;
  openExchangeRatesAppId?: string;
}): FxProvider {
  switch (config.provider) {
    case 'frankfurter':
      return new FrankfurterProvider();
    case 'openexchangerates':
      if (!config.openExchangeRatesAppId)
        throw new Error('FX_PROVIDER=openexchangerates needs OPEN_EXCHANGE_RATES_APP_ID');
      return new OpenExchangeRatesProvider({ appId: config.openExchangeRatesAppId });
    case 'static':
      return new StaticProvider();
  }
}
