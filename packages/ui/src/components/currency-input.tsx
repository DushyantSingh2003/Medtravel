'use client';

import type { Locale } from '@medtravel/contracts';
import { useEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { cn } from '../lib/cn';
import { currencyDigits, editableAmount, formatMinorUnits, parseMinorUnits } from '../lib/format';
import { fieldClasses } from './input';

export interface CurrencyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> {
  /** Integer minor units (cents, paise, fils). Never a float: CLAUDE.md money rule. Negative for refunds. */
  value: number | null;
  /** Called with the parsed amount, or `null` when the field is empty or its text is not a valid amount. */
  onChange: (minorUnits: number | null) => void;
  /** ISO 4217 code. The currency is chosen elsewhere; this field shows it next to the amount. */
  currency: string;
  locale: Locale;
  /** Reference to the input, so a form can focus the first invalid field. */
  ref?: Ref<HTMLInputElement>;
}

const display = (value: number | null, currency: string, locale: Locale): string =>
  value === null ? '' : formatMinorUnits(value, currency, locale);

/**
 * Money field. The user types a normal decimal amount; the component stores integer minor units and
 * shows the formatted amount (grouping and symbol) when the field loses focus.
 *
 * Text that is not a valid amount (or is ambiguous, see `parseMinorUnits`) is kept on screen and the
 * field is marked invalid, so the user can correct it instead of watching it vanish. The parent sees
 * `null` for it, as for an empty field; its schema decides which message to show.
 */
export function CurrencyInput({
  value,
  onChange,
  currency,
  locale,
  className,
  onBlur,
  onFocus,
  ref,
  'aria-invalid': ariaInvalid,
  ...props
}: CurrencyInputProps) {
  const digits = currencyDigits(currency, locale);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Initialised from the value so the first paint (and the server-rendered HTML) is not blank.
  const [draft, setDraft] = useState(() => display(value, currency, locale));
  const lastReported = useRef<number | null>(value);

  // The value changed from outside (form reset, another field): show it, even while focused.
  useEffect(() => {
    if (value === lastReported.current) return;
    lastReported.current = value;
    setInvalid(false);
    setDraft(
      value === null
        ? ''
        : focused
          ? editableAmount(value, digits)
          : display(value, currency, locale),
    );
  }, [value, currency, locale, digits, focused]);

  // The currency or language changed: reformat what is shown.
  useEffect(() => {
    if (!focused && !invalid) setDraft(display(value, currency, locale));
    // Only react to the currency or language, not to every value the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, locale]);

  return (
    // The amount is always read left to right, so the currency code sits at its right end in every
    // language and the padding that makes room for it is on the same side.
    <div className="relative" dir="ltr">
      <input
        {...props}
        ref={ref}
        data-slot="currency-input"
        inputMode={digits > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={draft}
        aria-invalid={ariaInvalid || invalid || undefined}
        className={cn(fieldClasses, 'h-10 pe-14 text-end', className)}
        onFocus={(event) => {
          setFocused(true);
          if (!invalid) setDraft(value === null ? '' : editableAmount(value, digits));
          onFocus?.(event);
        }}
        onChange={(event) => {
          const text = event.target.value;
          const parsed = parseMinorUnits(text, digits);
          lastReported.current = parsed;
          setDraft(text);
          setInvalid(text.trim() !== '' && parsed === null);
          onChange(parsed);
        }}
        onBlur={(event) => {
          setFocused(false);
          if (!invalid) setDraft(display(value, currency, locale));
          onBlur?.(event);
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium text-muted-foreground"
      >
        {currency}
      </span>
    </div>
  );
}
