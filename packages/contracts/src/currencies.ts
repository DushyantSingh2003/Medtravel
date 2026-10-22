import { z } from 'zod';

/** Currencies the public site can display prices in (PRD 5.1). Money itself is stored per record. */
export const DISPLAY_CURRENCIES = ['USD', 'EUR', 'INR', 'AED'] as const;
export const displayCurrencySchema = z.enum(DISPLAY_CURRENCIES);
export type DisplayCurrency = z.infer<typeof displayCurrencySchema>;
export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = 'USD';
