import {
  MoneyError,
  convertMinor,
  convertMoney,
  currencyDigits,
  money,
  type Money,
  type Rounding,
} from '@medtravel/contracts';
import type { Prisma } from '@medtravel/db';
import { fromScaled, invertRate, multiplyRates, toScaled } from './decimal.js';
import type { FxProvider } from './providers.js';

type Db = Prisma.TransactionClient;

/** The pivot currency cross rates go through when no direct rate is stored. */
export const PIVOT_CURRENCY = 'USD';
/** A rate older than this (relative to the day asked about) is not used: a stale price is worse than none. */
export const MAX_RATE_AGE_DAYS = 5;

export class RateUnavailableError extends MoneyError {
  constructor(from: string, to: string) {
    super(`No recent exchange rate from ${from} to ${to}`);
    this.name = 'RateUnavailableError';
  }
}

export interface ResolvedRate {
  /** Units of `to` per one unit of `from`, 8 places. */
  rate: string;
  /** When the (oldest) rate used was published. */
  asOf: Date;
  source: string;
  how: 'identity' | 'direct' | 'inverse' | 'pivot';
}

/** Writes a provider's rates. A pair at the same time is stored once, so running the job twice changes nothing. */
export async function storeRates(
  db: Db,
  input: { base: string; asOf: Date; source: string; rates: Record<string, string> },
): Promise<number> {
  const rows = Object.entries(input.rates)
    .filter(([quote]) => quote !== input.base)
    .map(([quote, rate]) => ({
      baseCurrency: input.base,
      quoteCurrency: quote,
      rate: fromScaled(toScaled(rate)),
      source: input.source,
      asOf: input.asOf,
    }));
  const created = await db.fxRate.createMany({ data: rows, skipDuplicates: true });
  return created.count;
}

/** Currency codes the platform works in. */
export async function activeCurrencyCodes(db: Db): Promise<string[]> {
  const rows = await db.currency.findMany({
    where: { active: true },
    select: { code: true },
    orderBy: { code: 'asc' },
  });
  return rows.map((row) => row.code);
}

/** Fetches today's rates for every active currency against the pivot and stores them. Throws (leaving old rates) on failure. */
export async function refreshRates(
  db: Db,
  provider: FxProvider,
): Promise<{ stored: number; asOf: Date; currencies: number }> {
  const codes = (await activeCurrencyCodes(db)).filter((code) => code !== PIVOT_CURRENCY);
  const fetched = await provider.fetchRates(PIVOT_CURRENCY, codes);
  const stored = await storeRates(db, {
    base: PIVOT_CURRENCY,
    asOf: fetched.asOf,
    source: provider.name,
    rates: fetched.rates,
  });
  return { stored, asOf: fetched.asOf, currencies: codes.length };
}

async function latest(db: Db, base: string, quote: string, date: Date) {
  return db.fxRate.findFirst({
    where: { baseCurrency: base, quoteCurrency: quote, asOf: { lte: date } },
    orderBy: { asOf: 'desc' },
    select: { rate: true, asOf: true, source: true },
  });
}

const tooOld = (asOf: Date, date: Date) =>
  date.getTime() - asOf.getTime() > MAX_RATE_AGE_DAYS * 86_400_000;

/**
 * The exchange rate from one currency to another on a date: the newest stored rate not after that date, direct, inverted, or
 * through USD. Throws `RateUnavailableError` when there is none or it is older than five days: callers must not guess.
 */
export async function rateOn(
  db: Db,
  from: string,
  to: string,
  date: Date = new Date(),
): Promise<ResolvedRate> {
  if (from === to)
    return { rate: fromScaled(toScaled('1')), asOf: date, source: 'identity', how: 'identity' };

  const direct = await latest(db, from, to, date);
  if (direct && !tooOld(direct.asOf, date))
    return {
      rate: fromScaled(toScaled(direct.rate.toFixed(8))),
      asOf: direct.asOf,
      source: direct.source,
      how: 'direct',
    };

  const reverse = await latest(db, to, from, date);
  if (reverse && !tooOld(reverse.asOf, date))
    return {
      rate: invertRate(reverse.rate.toFixed(8)),
      asOf: reverse.asOf,
      source: reverse.source,
      how: 'inverse',
    };

  if (from !== PIVOT_CURRENCY && to !== PIVOT_CURRENCY) {
    const [first, second] = await Promise.all([
      rateOn(db, from, PIVOT_CURRENCY, date).catch(() => null),
      rateOn(db, PIVOT_CURRENCY, to, date).catch(() => null),
    ]);
    if (first && second)
      return {
        rate: multiplyRates(first.rate, second.rate),
        asOf: first.asOf < second.asOf ? first.asOf : second.asOf,
        source: first.source === second.source ? first.source : `${first.source}+${second.source}`,
        how: 'pivot',
      };
  }
  throw new RateUnavailableError(from, to);
}

/** Decimal places a currency has: the master's setting, or Intl's when the master has none. */
async function digitsOf(db: Db, code: string): Promise<number> {
  const row = await db.currency.findUnique({ where: { code }, select: { minorUnits: true } });
  return row?.minorUnits ?? currencyDigits(code);
}

/** Converts an amount on a date, using the stored rate and the currencies' own decimals. */
export async function convert(
  db: Db,
  value: Money,
  to: string,
  date: Date = new Date(),
  rounding?: Rounding,
): Promise<{ money: Money; rate: ResolvedRate }> {
  const rate = await rateOn(db, value.currency, to, date);
  if (value.currency === to) return { money: value, rate };
  const [fromDigits, toDigits] = await Promise.all([
    digitsOf(db, value.currency),
    digitsOf(db, to),
  ]);
  // The master's decimals, rather than Intl's, decide how many minor units a currency has.
  return {
    money: money(convertMinor(value.amountMinor, fromDigits, toDigits, rate.rate, rounding), to),
    rate,
  };
}

/** The fields a quote stores to remember the rate it was priced with. */
export async function snapshotRate(
  db: Db,
  priced: string,
  shownIn: string,
  date: Date = new Date(),
) {
  const rate = await rateOn(db, priced, shownIn, date);
  return {
    fxRate: rate.rate,
    fxRateAt: rate.asOf,
    fxSource: rate.source,
    fxBaseCurrency: priced,
  };
}

export { convertMoney };
