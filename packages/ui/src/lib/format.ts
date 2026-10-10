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
    new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * Parses text typed by a user into an integer number of minor units, without floating point.
 *
 * Accepts `.` or `,` as the decimal separator and ignores spaces and thousands separators.
 * Returns `null` when the text is empty or not a valid amount. Extra fraction digits are
 * truncated, never rounded: rounding someone's typed amount silently would be worse than ignoring
 * the surplus digits.
 */
export function parseMinorUnits(text: string, digits: number): number | null {
  const cleaned = text
    .trim()
    // Spaces (including no-break and narrow no-break) and apostrophes used as thousands separators.
    .replace(/[\s\u00a0\u202f']/g, '')
    // Arabic-Indic (U+0660..0669) and Eastern Arabic-Indic (U+06F0..06F9) digits to Latin, in case
    // a keyboard types them.
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Arabic decimal (U+066B) and thousands (U+066C) separators.
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',');
  if (cleaned === '') return null;

  // Work out which separator, if any, is the decimal point. The rules are deliberately strict
  // and predictable, because a wrong guess silently changes an amount of money:
  //   - both '.' and ',' present: the one that comes last is the decimal point;
  //   - '.' alone: a decimal point, unless it appears more than once (then it groups thousands);
  //   - ',' alone: thousands when exactly three digits follow it ("1,234"), otherwise a decimal
  //     point ("12,5" or "1,5"), and thousands when it repeats ("1,234,567").
  // The field echoes the interpreted amount, formatted, when it loses focus so the user can check.
  const dots = (cleaned.match(/\./g) ?? []).length;
  const commas = (cleaned.match(/,/g) ?? []).length;
  let decimalSeparator: '.' | ',' | null = null;
  if (dots > 0 && commas > 0) {
    decimalSeparator = cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',') ? '.' : ',';
  } else if (dots === 1) {
    decimalSeparator = '.';
  } else if (commas === 1) {
    const after = cleaned.slice(cleaned.indexOf(',') + 1);
    decimalSeparator = after.length === 3 && digits !== 3 ? null : ',';
  }

  let integerPart = cleaned;
  let fractionPart = '';
  if (decimalSeparator) {
    const at = cleaned.lastIndexOf(decimalSeparator);
    integerPart = cleaned.slice(0, at);
    fractionPart = cleaned.slice(at + 1);
  }
  integerPart = integerPart.replace(/[.,]/g, '');
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;
  if (integerPart === '' && fractionPart === '') return null;

  const fraction = fractionPart.slice(0, digits).padEnd(digits, '0');
  const minor = Number(`${integerPart || '0'}${fraction}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Formats integer minor units as a localised amount, e.g. 123456 USD -> "$1,234.56". */
export function formatMinorUnits(minor: number, currency: string, locale: Locale = 'en'): string {
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
