'use client';

import type { Locale } from '@medtravel/contracts';
import { CalendarDays } from 'lucide-react';
import { ar } from 'date-fns/locale/ar';
import { enUS } from 'date-fns/locale/en-US';
import { useState, type Ref } from 'react';
import { DayPicker, type Matcher, type Modifiers } from 'react-day-picker';
import { cn } from '../lib/cn';
import { intlLocale } from '../lib/format';
import { fieldClasses } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerLabels {
  previousMonth: string;
  nextMonth: string;
  /** Name of the month drop-down. */
  month: string;
  /** Name of the year drop-down. */
  year: string;
  /** Added to the spoken name of today's date. */
  today: string;
  /** Added to the spoken name of the chosen date. */
  selected: string;
}

export interface DatePickerProps {
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  locale: Locale;
  placeholder: string;
  /** Texts for the calendar's buttons and drop-downs. */
  labels: DatePickerLabels;
  id?: string;
  disabled?: boolean;
  /** Clicking the chosen day again clears it. Off by default, so a required date is not cleared by accident. */
  clearable?: boolean;
  /** Dates that cannot be chosen, e.g. `{ before: new Date() }` for a future-only field. */
  disabledDates?: Matcher | Matcher[];
  /** First month the year drop-down offers. Default: 100 years ago. */
  startMonth?: Date;
  /** Last month the year drop-down offers. Default: 20 years from now. */
  endMonth?: Date;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Single-date picker with month and year drop-downs. Dates are calendar days: the Date's local year,
 * month and day are what count. Use `toDateOnly` / `fromDateOnly` to keep them as `YYYY-MM-DD` strings
 * in forms and API calls.
 */
export function DatePicker({
  value,
  onChange,
  onBlur,
  ref,
  locale,
  placeholder,
  labels,
  disabledDates,
  clearable = false,
  startMonth,
  endMonth,
  className,
  disabled,
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const formatter = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' });
  const thisYear = new Date().getFullYear();

  const common = {
    selected: value,
    defaultMonth: value,
    locale: locale === 'ar' ? ar : enUS,
    dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const),
    numerals: 'latn' as const,
    captionLayout: 'dropdown' as const,
    startMonth: startMonth ?? new Date(thisYear - 100, 0),
    endMonth: endMonth ?? new Date(thisYear + 20, 11),
    disabled: disabledDates,
    showOutsideDays: true,
    labels: {
      labelPrevious: () => labels.previousMonth,
      labelNext: () => labels.nextMonth,
      labelMonthDropdown: () => labels.month,
      labelYearDropdown: () => labels.year,
      labelDayButton: (date: Date, modifiers: Modifiers) =>
        [
          formatter.format(date),
          modifiers.today ? labels.today : null,
          modifiers.selected ? labels.selected : null,
        ]
          .filter(Boolean)
          .join(', '),
    },
  };
  const choose = (date: Date | undefined) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onBlur={onBlur}
          data-slot="date-picker"
          aria-haspopup="dialog"
          className={cn(
            fieldClasses,
            'flex h-10 items-center justify-between gap-2 text-start',
            !value && 'text-muted-foreground',
            className,
          )}
          {...rest}
        >
          <span className="truncate">{value ? formatter.format(value) : placeholder}</span>
          <CalendarDays className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        {clearable ? (
          <DayPicker mode="single" onSelect={choose} {...common} />
        ) : (
          <DayPicker mode="single" required onSelect={choose} {...common} />
        )}
      </PopoverContent>
    </Popover>
  );
}
