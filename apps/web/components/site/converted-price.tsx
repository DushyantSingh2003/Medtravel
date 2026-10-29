'use client';

import { useGetFxRates } from '@medtravel/api-client';
import type { Locale, Money } from '@medtravel/contracts';
import { Price } from '@medtravel/ui';
import { useLocale } from 'next-intl';
import { useCurrency } from '../../lib/currency-preference';
import { inCurrency } from '../../lib/display-price';

/**
 * A price in the currency the visitor chose in the header. The first render, and any moment the rates are not available,
 * show the price in the currency it was set in, so a page is never blank or wrong while rates load.
 */
export function ConvertedPrice({ price, className }: { price: Money; className?: string }) {
  const locale = useLocale() as Locale;
  const [currency] = useCurrency();
  const { data } = useGetFxRates(
    { base: price.currency },
    { query: { enabled: currency !== price.currency, staleTime: 300_000 } },
  );
  const rates = data?.status === 200 ? data.data : undefined;
  const converted = inCurrency(price, currency, rates);
  return converted && converted.currency !== price.currency ? (
    <Price value={converted} original={price} locale={locale} approximate className={className} />
  ) : (
    <Price value={price} locale={locale} className={className} />
  );
}
