'use client';

import type { Locale } from '@medtravel/contracts';
import { CalendarDays } from 'lucide-react';
import { ar } from 'date-fns/locale/ar';
import { enUS } from 'date-fns/locale/en-US';
import { useState } from 'react';
import { DayPicker, type Matcher } from 'react-day-picker';
import { cn } from '../lib/cn';
import { intlLocale } from '../lib/format';
import { fieldClasses } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerProps {
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  locale: Locale;
  placeholder: string;
  id?: string;
  disabled?: boolean;
  /** Dates that cannot be chosen, e.g. `{ before: new Date() }` for a future-only field. */
  disabledDates?: Matcher | Matcher[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/** Single-date picker. Dates are calendar days: the Date's local year, month and day are what count. */
export function DatePicker({ value, onChange, locale, placeholder, disabledDates, className, disabled, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-slot="date-picker"
          className={cn(fieldClasses, 'flex h-10 items-center justify-between gap-2 text-start', !value && 'text-muted-foreground', className)}
          {...rest}
        >
          <span className="truncate">{value ? formatter.format(value) : placeholder}</span>
          <CalendarDays className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <DayPicker
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          defaultMonth={value}
          locale={locale === 'ar' ? ar : enUS}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          numerals="latn"
          disabled={disabledDates}
          showOutsideDays
        />
      </PopoverContent>
    </Popover>
  );
}
