import { z } from 'zod';
import { moneySchema } from './money.js';

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Three capital letters (ISO 4217)');

export const fxRatesQuerySchema = z.object({
  /** The currency every rate is quoted from; prices are mostly kept in US dollars. */
  base: currencyCode.default('USD'),
});
export type FxRatesQuery = z.infer<typeof fxRatesQuerySchema>;

/** What one unit of `base` is worth in each currency we show, as decimal strings with 8 places. */
export const fxRatesSchema = z.object({
  base: currencyCode,
  /** The oldest rate date among those returned. */
  asOf: z.iso.datetime(),
  rates: z.record(currencyCode, z.string().regex(/^\d+\.\d{8}$/)),
});
export type FxRates = z.infer<typeof fxRatesSchema>;

export const fxConvertQuerySchema = z.object({
  amountMinor: z.coerce.number().int().safe(),
  from: currencyCode,
  to: currencyCode,
  /** Convert at the rate of this day; defaults to today. */
  date: z.iso.date().optional(),
});
export type FxConvertQuery = z.infer<typeof fxConvertQuerySchema>;

export const fxConvertedSchema = z.object({
  from: moneySchema,
  to: moneySchema,
  rate: z.string(),
  asOf: z.iso.datetime(),
  source: z.string(),
});
export type FxConverted = z.infer<typeof fxConvertedSchema>;
