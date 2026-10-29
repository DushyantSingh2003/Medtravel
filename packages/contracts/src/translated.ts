import type { Locale } from './primitives.js';
import { DEFAULT_LOCALE } from './primitives.js';

/**
 * Content kept in the database has its English text on the record itself and other languages in translation rows
 * (`{ locale, name, description }`). This returns each requested field in the viewer's language, and falls back to the English
 * value field by field when a translation is missing or blank, so a half-translated record never shows an empty name.
 */
export function getTranslated<
  Entity extends Record<string, unknown>,
  Field extends keyof Entity & string,
>(
  entity: Entity,
  translations:
    ReadonlyArray<{ locale: string } & Partial<Record<Field, string | null>>> | null | undefined,
  locale: Locale,
  fields: readonly Field[],
): { [K in Field]: Entity[K] } {
  const match =
    locale === DEFAULT_LOCALE ? undefined : translations?.find((row) => row.locale === locale);
  const result = {} as { [K in Field]: Entity[K] };
  for (const field of fields) {
    const translated = match?.[field];
    result[field] = (
      typeof translated === 'string' && translated.trim() !== '' ? translated : entity[field]
    ) as Entity[Field];
  }
  return result;
}
