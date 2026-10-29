import type { Locale, Money } from '@medtravel/contracts';
import { formatMoney, type FormatMoneyOptions } from '@medtravel/contracts';
import { cn } from '../lib/cn';

export interface PriceProps extends FormatMoneyOptions {
  value: Money;
  locale: Locale;
  /** Show the amount as an estimate (a converted price), with a leading "≈". */
  approximate?: boolean;
  /** The price in the currency it was set in, shown smaller beneath a converted one; already a price, not text. */
  original?: Money;
  className?: string;
}

/**
 * A price in the viewer's language. The figure keeps its own left-to-right order inside right-to-left text, so
 * `AED 1,500.00` never reads backwards in Arabic, and digits are always Latin.
 */
export function Price({ value, locale, approximate, original, className, ...format }: PriceProps) {
  return (
    <span data-slot="price" className={cn('inline-flex flex-col tabular-nums', className)}>
      <bdi dir="ltr" data-currency={value.currency}>
        {approximate ? '≈ ' : null}
        {formatMoney(value, locale, format)}
      </bdi>
      {original && original.currency !== value.currency ? (
        <bdi dir="ltr" className="text-xs text-muted-foreground" data-currency={original.currency}>
          {formatMoney(original, locale, format)}
        </bdi>
      ) : null}
    </span>
  );
}
