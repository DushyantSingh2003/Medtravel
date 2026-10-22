'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_DISPLAY_CURRENCY,
  displayCurrencySchema,
  type DisplayCurrency,
} from '@medtravel/contracts';

export const CURRENCY_COOKIE = 'mt_currency';

/** The chosen display currency from a `document.cookie` string, or the default. */
export function readCurrency(cookieString: string): DisplayCurrency {
  const entry = cookieString
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CURRENCY_COOKIE}=`));
  const parsed = displayCurrencySchema.safeParse(entry?.slice(CURRENCY_COOKIE.length + 1));
  return parsed.success ? parsed.data : DEFAULT_DISPLAY_CURRENCY;
}

/** A cookie for the choice. It is a preference, not a secret, so it is readable by scripts. */
export function currencyCookie(currency: DisplayCurrency): string {
  return `${CURRENCY_COOKIE}=${currency}; path=/; max-age=31536000; samesite=lax`;
}

const listeners = new Set<() => void>();

/**
 * The display currency, from the cookie. The server and the first client render both see the default,
 * so the statically generated HTML is the same for everyone; the saved choice applies right after.
 */
export function useCurrency(): [DisplayCurrency, (currency: DisplayCurrency) => void] {
  const currency = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readCurrency(document.cookie),
    () => DEFAULT_DISPLAY_CURRENCY,
  );
  const choose = (next: DisplayCurrency) => {
    document.cookie = currencyCookie(next);
    listeners.forEach((listener) => listener());
  };
  return [currency, choose];
}
