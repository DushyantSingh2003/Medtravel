import { DEFAULT_LOCALE, LOCALES, type Locale } from './primitives.js';

/** Countries where Arabic is the everyday language (ISO 3166-1 alpha-2); a visitor from one gets Arabic when nothing else says. */
export const ARABIC_COUNTRIES = [
  'AE',
  'BH',
  'DJ',
  'DZ',
  'EG',
  'IQ',
  'JO',
  'KM',
  'KW',
  'LB',
  'LY',
  'MA',
  'MR',
  'OM',
  'PS',
  'QA',
  'SA',
  'SD',
  'SO',
  'SY',
  'TN',
  'YE',
] as const;

export const LOCALE_COOKIE = 'NEXT_LOCALE';

const asLocale = (value: string | undefined | null): Locale | null => {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(base ?? '') ? (base as Locale) : null;
};

/** The first supported language in an `Accept-Language` header, by weight, or null. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranges = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(/q=([0-9.]+)/.exec(params.join(';'))?.[1] ?? '1');
      return { tag: tag ?? '', q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((range) => range.tag && range.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const range of ranges) {
    const locale = asLocale(range.tag);
    if (locale) return locale;
  }
  return null;
}

export function fromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return (ARABIC_COUNTRIES as readonly string[]).includes(country.trim().toUpperCase())
    ? 'ar'
    : null;
}

/**
 * Which language to show a first-time visitor: the one they chose before (cookie), then what their browser asks for, then the
 * language of their country (Arabic-speaking countries), then English.
 */
export function negotiateLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): Locale {
  return (
    asLocale(input.cookie) ??
    fromAcceptLanguage(input.acceptLanguage) ??
    fromCountry(input.country) ??
    DEFAULT_LOCALE
  );
}
