import { MoneyError, divideRounded, parseDecimal } from '@medtravel/contracts';

/** Places an exchange rate keeps (the `FxRate.rate` column is DECIMAL(18,8)). */
export const RATE_PLACES = 8;
const SCALE = 10n ** BigInt(RATE_PLACES);

/** A positive decimal string as an integer count of 10^-8. */
export function toScaled(text: string): bigint {
  const { n, d } = parseDecimal(text);
  if (n <= 0n) throw new MoneyError('An exchange rate is positive');
  return divideRounded(n * SCALE, d);
}

/** Back to text with exactly 8 places (`83.25000000`), the shape the database returns. */
export function fromScaled(value: bigint): string {
  const whole = value / SCALE;
  const fraction = (value % SCALE).toString().padStart(RATE_PLACES, '0');
  return `${whole}.${fraction}`;
}

/** 1 / rate, to 8 places. */
export function invertRate(rate: string): string {
  const scaled = toScaled(rate);
  return fromScaled(divideRounded(SCALE * SCALE, scaled));
}

/** a * b, to 8 places (a cross rate through a pivot currency). */
export function multiplyRates(a: string, b: string): string {
  return fromScaled(divideRounded(toScaled(a) * toScaled(b), SCALE));
}

/** A number from a provider's JSON as a decimal string with at most 8 places, without an exponent. */
export function numberToRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new MoneyError(`Not an exchange rate: ${value}`);
  return fromScaled(BigInt(Math.round(value * 1e8)));
}
