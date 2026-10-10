'use client';

import type { Locale } from '@medtravel/contracts';
import { AsYouType, getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { useMemo, useState } from 'react';
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
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/** Regional-indicator flag emoji for a two-letter country code. */
const flagOf = (country: string): string =>
  country.replace(/./g, (letter) => String.fromCodePoint(0x1f1a5 + letter.toUpperCase().charCodeAt(0)));

/**
 * Phone number with a country-code picker. The value is always E.164 (or empty): the national
 * digits are formatted as you type for the chosen country, and the full number is only reported
 * once it parses, so a half-typed number never reaches the form as a valid-looking value.
 */
export function PhoneInput({
  value,
  onChange,
  locale,
  labels,
  defaultCountry = 'IN',
  preferredCountries = ['IN', 'AE', 'US', 'GB'],
  className,
  id,
  disabled,
  ...aria
}: PhoneInputProps) {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined;
  const [country, setCountry] = useState<CountryCode>(parsed?.country ?? defaultCountry);
  const [national, setNational] = useState<string>(parsed ? parsed.formatNational() : '');

  const options = useMemo(() => {
    const names = new Intl.DisplayNames(intlLocale(locale), { type: 'region' });
    const all = getCountries().map((code) => ({
      value: code,
      label: `${flagOf(code)} ${names.of(code) ?? code} +${getCountryCallingCode(code)}`,
      keywords: [code, `+${getCountryCallingCode(code)}`, names.of(code) ?? ''],
    }));
    const rank = (code: string) => {
      const at = preferredCountries.indexOf(code as CountryCode);
      return at === -1 ? preferredCountries.length : at;
    };
    return all.sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label, intlLocale(locale)));
  }, [locale, preferredCountries]);

  function emit(nextCountry: CountryCode, text: string) {
    const phone = parsePhoneNumberFromString(text, nextCountry);
    onChange(phone?.isValid() ? phone.number : '');
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
