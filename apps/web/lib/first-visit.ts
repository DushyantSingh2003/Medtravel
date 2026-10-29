import { LOCALE_COOKIE, negotiateLocale, type Locale } from '@medtravel/contracts';

/** Where the hosting platform says the visitor is, when it says so. */
export function countryFromHeaders(headers: Headers): string | null {
  return (
    headers.get('x-vercel-ip-country') ??
    headers.get('cf-ipcountry') ??
    headers.get('x-country-code')
  );
}

/**
 * The language to open the site in for a visitor who has not chosen one: their browser's, then their country's, then English.
 * Returns null when they already chose (the cookie decides, and next-intl reads it itself).
 */
export function languageForFirstVisit(
  headers: Headers,
  cookies: { get(name: string): { value: string } | undefined },
): Locale | null {
  if (cookies.get(LOCALE_COOKIE)?.value) return null;
  return negotiateLocale({
    cookie: null,
    acceptLanguage: headers.get('accept-language'),
    country: countryFromHeaders(headers),
  });
}
