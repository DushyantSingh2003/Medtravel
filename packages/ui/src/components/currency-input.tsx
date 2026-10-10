'use client';

import type { Locale } from '@medtravel/contracts';
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { currencyDigits, editableAmount, formatMinorUnits, parseMinorUnits } from '../lib/format';
import { fieldClasses } from './input';

export interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  /** Integer minor units (cents, paise, fils). Never a float: CLAUDE.md money rule. */
  value: number | null;
  onChange: (minorUnits: number | null) => void;
  /** ISO 4217 code. The currency is chosen elsewhere; this field shows it next to the amount. */
  currency: string;
  locale: Locale;
}

/**
 * Money field. The user types a normal decimal amount; the component stores integer minor units and
 * shows the formatted amount (with grouping and symbol) when the field loses focus.
 */
export function CurrencyInput({ value, onChange, currency, locale, className, onBlur, onFocus, ...props }: CurrencyInputProps) {
  const digits = currencyDigits(currency, locale);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  // Keep the draft in step with the value when it changes from outside (form reset, other field).
  useEffect(() => {
    if (!focused) setDraft(value === null ? '' : formatMinorUnits(value, currency, locale));
  }, [value, currency, locale, focused]);

  return (
    <div className="relative">
      <input
        {...props}
        data-slot="currency-input"
        inputMode={digits > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={draft}
        className={cn(fieldClasses, 'h-10 pe-14', className)}
        onFocus={(event) => {
          setFocused(true);
          setDraft(value === null ? '' : editableAmount(value, digits));
          onFocus?.(event);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(parseMinorUnits(event.target.value, digits));
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium text-muted-foreground"
        dir="ltr"
      >
        {currency}
      </span>
    </div>
  );
}
