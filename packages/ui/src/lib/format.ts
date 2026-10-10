import type { Locale } from '@medtravel/contracts';

/**
 * Intl locale tag for a platform locale.
 *
 * Arabic is formatted with Latin digits (the `nu-latn` extension). Dates, money amounts and phone
 * numbers on this platform are compared against invoices, passports and bank statements that use
 * Latin digits, and mixed digit systems cause costly misreadings.
 */
export const intlLocale = (locale: Locale): string => (locale === 'ar' ? 'ar-u-nu-latn' : 'en');

/** Number of minor-unit digits for a currency (2 for USD, 0 for JPY, 3 for KWD). */
export function currencyDigits(currency: string, locale: Locale = 'en'): number {
  return (
    new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** `1,234` / `1.234` style grouping: 1-3 digits, then groups of exactly three (or Indian 2-2-3 with commas). */
function hasValidGrouping(text: string, separator: '.' | ','): boolean {
  const escaped = separator === '.' ? '\\.' : ',';
  if (new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`).test(text)) return true;
  return separator === ',' && /^\d{1,2}(?:,\d{2})+,\d{3}$/.test(text);
}

/**
 * Parses text typed by a user into an integer number of minor units, without floating point.
 *
 * A wrong guess silently changes an amount of money, so anything ambiguous or malformed returns
 * `null` instead of a guess. The rules:
 *   - spaces are ignored; a leading `-` makes the amount negative (refunds, credit notes);
 *   - both `.` and `,` present: the last one is the decimal point and the other groups thousands,
 *     which must be grouped correctly ("1,234.56", "1.234,56", "12,34,567.00");
 *   - one separator type used several times is thousands and must be grouped correctly
 *     ("1,234,567"); "1.2.3" and "1,2,3" are rejected;
 *   - a single `.` is a decimal point, but with more fraction digits than the currency has it is
 *     rejected ("1.234" in USD could be 1.23 or 1234; "1.5" in JPY, which has no fraction);
 *   - a single `,` followed by one to `digits` digits is a decimal point ("12,5"); followed by
 *     exactly three digits it is thousands ("1,234"), except in a three-decimal currency such as
 *     KWD where "1,234" could equally be 1.234 and is rejected; any other count is rejected.
 * The field also echoes the interpreted amount, formatted, when it loses focus.
 */
export function parseMinorUnits(text: string, digits: number): number | null {
  let cleaned = text
    .trim()
    // Spaces (including no-break and narrow no-break) and apostrophes used as thousands separators.
    .replace(/[\s\u00a0\u202f']/g, '')
    // Arabic-Indic (U+0660..0669) and Eastern Arabic-Indic (U+06F0..06F9) digits to Latin, in case
    // a keyboard types them.
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Arabic decimal (U+066B) and thousands (U+066C) separators, and the Unicode minus sign.
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/\u2212/g, '-');
  if (cleaned === '') return null;

  let sign = 1;
  if (cleaned.startsWith('-')) {
    sign = -1;
    cleaned = cleaned.slice(1);
  }
  if (!/^[\d.,]+$/.test(cleaned)) return null;

  const dots = (cleaned.match(/\./g) ?? []).length;
  const commas = (cleaned.match(/,/g) ?? []).length;
  let integer: string;
  let fraction = '';

  if (dots === 0 && commas === 0) {
    integer = cleaned;
  } else if (dots > 0 && commas > 0) {
    const decimal = cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',') ? '.' : ',';
    const grouping = decimal === '.' ? ',' : '.';
    const at = cleaned.lastIndexOf(decimal);
    const head = cleaned.slice(0, at);
    if (head.includes(decimal) || !hasValidGrouping(head, grouping)) return null;
    integer = head.split(grouping).join('');
    fraction = cleaned.slice(at + 1);
  } else {
    const separator: '.' | ',' = dots > 0 ? '.' : ',';
    if (Math.max(dots, commas) > 1) {
      if (!hasValidGrouping(cleaned, separator)) return null;
      integer = cleaned.split(separator).join('');
    } else {
      const at = cleaned.indexOf(separator);
      const before = cleaned.slice(0, at);
      const after = cleaned.slice(at + 1);
      const thousands =
        separator === ',' && after.length === 3 && before.length >= 1 && before.length <= 3;
      if (thousands && digits !== 3) {
        integer = before + after;
      } else if (thousands && digits === 3 && after.length === 3) {
        return null; // "1,234" in a three-decimal currency: 1.234 or 1234, cannot tell
      } else if (after.length <= digits) {
        integer = before;
        fraction = after;
      } else {
        return null;
      }
    }
  }

  if (!/^\d*$/.test(integer) || !/^\d*$/.test(fraction) || fraction.length > digits) return null;
  if (integer === '' && fraction === '') return null;
  const minor = Number(`${integer || '0'}${fraction.padEnd(digits, '0')}`);
  return Number.isSafeInteger(minor) ? sign * minor : null;
}

/** Formats integer minor units as a localised amount, e.g. 123456 USD -> "$1,234.56". */
export function formatMinorUnits(minor: number, currency: string, locale: Locale = 'en'): string {
  // A float or NaN would format as "12..5" or "NaN": money is integer minor units, so refuse anything else.
  if (!Number.isSafeInteger(minor))
    throw new RangeError(`Money must be an integer number of minor units, got ${minor}`);
  const digits = currencyDigits(currency, locale);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const text = String(abs).padStart(digits + 1, '0');
  const integer = text.slice(0, text.length - digits);
  const fraction = digits > 0 ? text.slice(-digits) : '';
  // Intl accepts a decimal string; formatting from a string avoids float error for large amounts.
  const decimal = `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).format(
    decimal as unknown as number,
  );
}

/** The plain editable text for a value (no symbol, no grouping): 123456 USD -> "1234.56". */
export function editableAmount(minor: number, digits: number): string {
  const text = String(Math.abs(minor)).padStart(digits + 1, '0');
  const integer = text.slice(0, text.length - digits);
  const fraction = digits > 0 ? text.slice(-digits) : '';
  return `${minor < 0 ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}
