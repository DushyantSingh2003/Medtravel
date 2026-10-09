import { DEFAULT_LOCALE, LOCALES, isRtlLocale, type Locale } from '@medtravel/contracts';
import ar from './messages/ar.json' with { type: 'json' };
import en from './messages/en.json' with { type: 'json' };

export { DEFAULT_LOCALE, LOCALES, isRtlLocale };
export type { Locale };

/** Text direction for a locale, for the `dir` attribute on <html>. */
export const directionOf = (locale: Locale): 'ltr' | 'rtl' => (isRtlLocale(locale) ? 'rtl' : 'ltr');

/** Narrow an unknown value (a route segment) to a supported locale. */
export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/** Human-readable names, shown in the language switcher in the language's own script. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/**
 * Message catalogues, imported statically.
 *
 * A dynamic `import(\`./messages/${locale}.json\`)` reads better but neither Turbopack nor
 * Node can resolve a template specifier, so the catalogues would go missing at build time.
 * A static map also means a missing catalogue is a type error rather than a runtime one.
 */
const CATALOGUES: Record<Locale, Record<string, unknown>> = {
  en,
  ar,
};

/**
 * Load a locale's messages. Both Next apps call this from `next-intl`'s request config.
 * `ar` falls back to `en` for any key it has not translated yet, so a half-finished
 * translation renders English rather than the raw key.
 */
export function loadMessages(locale: Locale): Record<string, unknown> {
  return { ...CATALOGUES.en, ...CATALOGUES[locale] };
}
