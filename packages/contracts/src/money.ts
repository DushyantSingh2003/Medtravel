import { z } from 'zod';
import type { Locale } from './primitives.js';

/** An amount of money: whole minor units (cents, paise, fils) and an ISO 4217 code. Never a decimal number. */
export const moneySchema = z.object({
  amountMinor: z.number().int().refine(Number.isSafeInteger, 'amount is too large'),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof moneySchema>;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Intl tag with Latin digits in Arabic (amounts are compared with invoices and bank statements that use them). */
export const intlTag = (locale: Locale): string => (locale === 'ar' ? 'ar-u-nu-latn' : 'en');

/** Decimal places a currency has (2 for USD, 0 for JPY, 3 for KWD), from the platform's Intl data. */
export function currencyDigits(currency: string, locale: Locale = 'en'): number {
  return (
    new Intl.NumberFormat(intlTag(locale), { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

const toBig = (value: number): bigint => BigInt(value);
function fromBig(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new MoneyError('The amount is too large to hold');
  return Number(value);
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isSafeInteger(amountMinor))
    throw new MoneyError('Money is a whole number of minor units');
  if (!/^[A-Z]{3}$/.test(currency)) throw new MoneyError(`Not a currency code: ${currency}`);
  return { amountMinor, currency };
}

function same(a: Money, b: Money): void {
  if (a.currency !== b.currency)
    throw new MoneyError(`Cannot combine ${a.currency} with ${b.currency}: convert first`);
}

export const add = (a: Money, b: Money): Money => {
  same(a, b);
  return money(fromBig(toBig(a.amountMinor) + toBig(b.amountMinor)), a.currency);
};
export const subtract = (a: Money, b: Money): Money => {
  same(a, b);
  return money(fromBig(toBig(a.amountMinor) - toBig(b.amountMinor)), a.currency);
};
export const negate = (a: Money): Money => money(-a.amountMinor || 0, a.currency);
export const sum = (currency: string, parts: readonly Money[]): Money =>
  parts.reduce((total, part) => add(total, part), money(0, currency));
export const compare = (a: Money, b: Money): -1 | 0 | 1 => {
  same(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
};
export const isZero = (a: Money): boolean => a.amountMinor === 0;

// ---- exact decimals -------------------------------------------------------------------------------------------
/** A ratio held as integers, so no floating point sneaks in: `n / d`. */
export interface Fraction {
  n: bigint;
  d: bigint;
}

/** `"0.125"`, `"12"`, `"-3.5"` to a fraction; anything else (an exponent, a comma, NaN) is rejected. */
export function parseDecimal(text: string): Fraction {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new MoneyError(`Not a decimal number: ${text}`);
  const [, sign, whole, fraction = ''] = match;
  const d = 10n ** BigInt(fraction.length);
  const n = BigInt(`${whole}${fraction}`) * (sign === '-' ? -1n : 1n);
  return { n, d };
}

export const ROUNDING = ['half_even', 'half_up', 'up', 'down'] as const;
export type Rounding = (typeof ROUNDING)[number];

/** Divides integers and rounds the result as asked (the usual banker's rounding by default). */
export function divideRounded(n: bigint, d: bigint, rounding: Rounding = 'half_even'): bigint {
  if (d === 0n) throw new MoneyError('Division by zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let quotient = n / d;
  const remainder = n % d;
  if (remainder === 0n) return quotient;
  const negative = n < 0n;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  const awayFromZero = negative ? -1n : 1n;
  switch (rounding) {
    case 'down':
      break;
    case 'up':
      quotient += awayFromZero;
      break;
    case 'half_up':
      if (twice >= d) quotient += awayFromZero;
      break;
    case 'half_even':
      if (twice > d || (twice === d && quotient % 2n !== 0n)) quotient += awayFromZero;
      break;
  }
  return quotient;
}

/** Multiplies by a ratio given as a decimal string (`"0.125"`) or a fraction, rounding to a whole minor unit. */
export function multiply(
  a: Money,
  ratio: string | Fraction,
  rounding: Rounding = 'half_even',
): Money {
  const { n, d } = typeof ratio === 'string' ? parseDecimal(ratio) : ratio;
  return money(fromBig(divideRounded(toBig(a.amountMinor) * n, d, rounding)), a.currency);
}

/**
 * Splits an amount by weights so the parts add up to the whole exactly (largest remainder; ties go to the earlier part).
 * `allocate(100, [1, 1, 1])` is 34, 33, 33.
 */
export function allocate(a: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new MoneyError('Nothing to allocate to');
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0))
    throw new MoneyError('Weights are whole, non-negative numbers');
  const total = weights.reduce((x, w) => x + BigInt(w), 0n);
  if (total === 0n) throw new MoneyError('The weights add up to zero');
  const amount = toBig(a.amountMinor);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const shares = weights.map((w) => (abs * BigInt(w)) / total);
  let left = abs - shares.reduce((x, s) => x + s, 0n);
  const order = weights
    .map((w, index) => ({ index, rest: (abs * BigInt(w)) % total }))
    .sort((x, y) => (x.rest === y.rest ? x.index - y.index : x.rest > y.rest ? -1 : 1));
  for (const { index } of order) {
    if (left === 0n) break;
    shares[index] = (shares[index] as bigint) + 1n;
    left -= 1n;
  }
  return shares.map((s) => money(fromBig(negative ? -s : s), a.currency));
}

/**
 * Converts between currencies with an exchange rate (units of the target per one unit of the source, a decimal string with up
 * to 8 places as in `FxRate`). The currencies' own decimal places are taken into account (INR 2, JPY 0, KWD 3).
 */
export function convertMinor(
  amountMinor: number,
  fromDigits: number,
  toDigits: number,
  rate: string,
  rounding: Rounding = 'half_even',
): number {
  const r = parseDecimal(rate);
  if (r.n <= 0n) throw new MoneyError('An exchange rate is positive');
  const scale = 10n ** BigInt(Math.max(fromDigits, toDigits));
  const up = scale / 10n ** BigInt(fromDigits);
  const down = scale / 10n ** BigInt(toDigits);
  // value_to_minor = amount * 10^(toDigits - fromDigits) * rate
  return fromBig(divideRounded(toBig(amountMinor) * r.n * up, r.d * down, rounding));
}

export function convertMoney(
  a: Money,
  to: string,
  rate: string,
  rounding: Rounding = 'half_even',
): Money {
  if (a.currency === to) return a;
  return money(
    convertMinor(a.amountMinor, currencyDigits(a.currency), currencyDigits(to), rate, rounding),
    to,
  );
}

// ---- display --------------------------------------------------------------------------------------------------
export interface FormatMoneyOptions {
  /** `1.2K`-style short form for dashboards. */
  compact?: boolean;
  /** Hide the decimals when they are zero (`$1,200` instead of `$1,200.00`). */
  trimZeroDecimals?: boolean;
  /** `ISO` shows `USD 1,200.00` instead of the symbol. */
  display?: 'symbol' | 'code';
}

/** A price as text for a viewer: symbol or code, grouping and decimals of the locale, Latin digits in Arabic. */
export function formatMoney(
  value: Money,
  locale: Locale,
  options: FormatMoneyOptions = {},
): string {
  const digits = currencyDigits(value.currency, locale);
  const whole = BigInt(value.amountMinor);
  const scale = 10n ** BigInt(digits);
  const negative = whole < 0n;
  const abs = negative ? -whole : whole;
  // Format from exact integer parts: dividing a large amount as a float would round it.
  const integerPart = abs / scale;
  const fractionPart = abs % scale;
  const hasFraction = fractionPart !== 0n;
  const showDecimals = !(options.trimZeroDecimals && !hasFraction);
  const formatter = new Intl.NumberFormat(intlTag(locale), {
    style: 'currency',
    currency: value.currency,
    currencyDisplay: options.display === 'code' ? 'code' : 'symbol',
    ...(options.compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    ...(!options.compact
      ? { minimumFractionDigits: showDecimals ? digits : 0, maximumFractionDigits: digits }
      : {}),
  });
  const amountText = `${negative ? '-' : ''}${integerPart}${digits > 0 ? `.${fractionPart.toString().padStart(digits, '0')}` : ''}`;
  // `Intl` accepts an exact decimal string for the value (a string avoids converting a big amount to a float).
  return formatter.format(amountText as unknown as number);
}
