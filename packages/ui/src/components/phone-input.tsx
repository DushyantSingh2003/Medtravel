'use client';

import type { Locale } from '@medtravel/contracts';
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from 'libphonenumber-js';
import { useEffect, useMemo, useRef, useState, type FocusEventHandler, type Ref } from 'react';
import { cn } from '../lib/cn';
import { intlLocale } from '../lib/format';
import { Combobox } from './combobox';
import { fieldClasses } from './input';

export interface PhoneInputLabels {
  /** Accessible name of the country picker, e.g. "Country code". */
  country: string;
  searchCountry: string;
  noCountry: string;
}

export interface PhoneInputProps {
  /** Phone number in E.164 form ("+919876543210"), or an empty string. */
  value: string;
  onChange: (e164: string) => void;
  locale: Locale;
  labels: PhoneInputLabels;
  defaultCountry?: CountryCode;
  /** Shown first in the country list, in this order. */
  preferredCountries?: CountryCode[];
  id?: string;
  disabled?: boolean;
  /** Reference to the number input, so a form can focus the first invalid field. */
  ref?: Ref<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/** Shown first in the country list, in this order. A module constant so the list is built once per locale. */
const DEFAULT_PREFERRED: CountryCode[] = ['IN', 'AE', 'US', 'GB'];

/** Regional-indicator flag emoji for a two-letter country code. */
const flagOf = (country: string): string =>
  country.replace(/./g, (letter) =>
    String.fromCodePoint(0x1f1a5 + letter.toUpperCase().charCodeAt(0)),
  );

/**
 * Phone number with a country-code picker. The value is always E.164 (or empty): the national
 * digits are formatted as you type for the chosen country, and the full number is only reported
 * once it parses, so a half-typed number never reaches the form as a valid-looking value.
 */
/**
 * How a stored number appears in the box: formatted as typing formats it (no trunk prefix such as the
 * 0 that `formatNational` adds), or in international form when the calling code has no single country.
 */
function displayOf(phone: PhoneNumber): string {
  return phone.country
    ? new AsYouType(phone.country).input(phone.nationalNumber)
    : phone.formatInternational();
}

export function PhoneInput({
  value,
  onChange,
  locale,
  labels,
  defaultCountry = 'IN',
  preferredCountries = DEFAULT_PREFERRED,
  className,
  id,
  disabled,
  ref,
  onBlur,
  ...aria
}: PhoneInputProps) {
  const initial = value ? parsePhoneNumberFromString(value) : undefined;
  const [country, setCountry] = useState<CountryCode>(initial?.country ?? defaultCountry);
  // Numbers whose calling code several countries share (+1, +7) have no single country, so they are
  // shown in international form and parsed without one.
  const [national, setNational] = useState<string>(initial ? displayOf(initial) : '');
  const lastEmitted = useRef(value);

  // Follow the value when it is changed from outside (form reset, defaults loaded from the API,
  // setValue), but not when it is merely the echo of what this field just reported.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    if (!value) {
      setNational('');
      return;
    }
    const phone = parsePhoneNumberFromString(value);
    if (!phone) return;
    if (phone.country) setCountry(phone.country);
    setNational(displayOf(phone));
  }, [value]);

  const options = useMemo(() => {
    const names = new Intl.DisplayNames(intlLocale(locale), { type: 'region' });
    const all = getCountries().map((code) => ({
      value: code,
      label: `${names.of(code) ?? code} +${getCountryCallingCode(code)}`,
      adornment: flagOf(code),
      keywords: [code, `+${getCountryCallingCode(code)}`, names.of(code) ?? ''],
    }));
    const rank = (code: string) => {
      const at = preferredCountries.indexOf(code as CountryCode);
      return at === -1 ? preferredCountries.length : at;
    };
    return all.sort(
      (a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label, intlLocale(locale)),
    );
  }, [locale, preferredCountries]);

  function emit(nextCountry: CountryCode, text: string) {
    const phone = parsePhoneNumberFromString(text, nextCountry);
    const next = phone?.isValid() ? phone.number : '';
    lastEmitted.current = next;
    onChange(next);
  }

  return (
    <div className={cn('flex gap-2', className)} dir="ltr">
      <div className="w-32 shrink-0 sm:w-44">
        <Combobox
          options={options}
          value={country}
          onChange={(next) => {
            const nextCountry = (next ?? country) as CountryCode;
            setCountry(nextCountry);
            emit(nextCountry, national);
          }}
          placeholder={labels.country}
          searchPlaceholder={labels.searchCountry}
          emptyLabel={labels.noCountry}
          disabled={disabled}
          aria-label={labels.country}
        />
      </div>
      <input
        id={id}
        ref={ref}
        onBlur={onBlur}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        value={national}
        onChange={(event) => {
          const text = new AsYouType(country).input(event.target.value);
          setNational(text);
          emit(country, text);
        }}
        className={cn(fieldClasses, 'h-10 flex-1')}
        {...aria}
      />
    </div>
  );
}
