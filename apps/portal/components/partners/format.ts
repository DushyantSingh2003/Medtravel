import { formatMoney, type DiffRow, type Locale } from '@medtravel/contracts';

type Scalar = DiffRow['proposed'];

/** A diff value as the text a reviewer reads: money as money, empty as a dash, everything else as it is. */
export function diffText(
  field: string,
  value: Scalar,
  currency: string | null,
  locale: Locale,
  empty: string,
): string {
  if (value === null || value === '') return empty;
  if (field === 'priceMinor' && typeof value === 'number' && currency)
    return formatMoney({ amountMinor: value, currency }, locale);
  return String(value);
}

export const dateTime = (locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export const dateOnly = (locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });

/** 1250 basis points as `12.5%`. */
export const percentOfBp = (bp: number): string =>
  `${Number.isInteger(bp / 100) ? bp / 100 : (bp / 100).toFixed(2).replace(/0$/, '')}%`;
