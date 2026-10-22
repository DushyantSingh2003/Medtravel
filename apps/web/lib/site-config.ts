import { DEFAULT_LOCALE, LOCALES } from '@medtravel/i18n';

/**
 * Public site settings read from the environment at build time (NEXT_PUBLIC_*). Both are optional:
 * an empty value counts as unset, because the Docker build passes empty strings when not configured.
 */
const DEFAULT_SITE_URL = 'http://localhost:3000';

/** True when a deployment gave the site its real address (`NEXT_PUBLIC_SITE_URL`). */
export const isSiteUrlConfigured = (
  value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): boolean => Boolean(value);

export function siteUrl(): URL {
  const value = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
  try {
    return new URL(value);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must be a full URL such as https://example.com, got "${value}"`,
    );
  }
}

/** `https://wa.me/<digits>`, or null when no valid number is configured (the button is then hidden). */
export function whatsappLink(
  raw: string | undefined = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
): string | null {
  const digits = (raw ?? '').replace(/[\s+()-]/g, '');
  return /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
}

/** `hreflang` alternates for a path such as `/treatments` (empty for the home page). */
export function languageAlternates(path: string): Record<string, string> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, `/${locale}${path}`]));
}

/**
 * Canonical address and language alternates of a page, for `metadata.alternates`. `x-default` is the
 * English page, for visitors whose language is neither. Paths are made absolute by `metadataBase`.
 */
export function pageAlternates(locale: string, path: string) {
  return {
    canonical: `/${locale}${path}`,
    languages: { ...languageAlternates(path), 'x-default': `/${DEFAULT_LOCALE}${path}` },
  };
}
