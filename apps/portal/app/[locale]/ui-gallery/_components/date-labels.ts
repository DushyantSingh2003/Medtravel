import type { DatePickerLabels } from '@medtravel/ui';

/** Builds the calendar's texts from the gallery's translations. */
export function datePickerLabels(t: (key: string) => string): DatePickerLabels {
  return {
    previousMonth: t('datePicker.previousMonth'),
    nextMonth: t('datePicker.nextMonth'),
    month: t('datePicker.month'),
    year: t('datePicker.year'),
    today: t('datePicker.today'),
    selected: t('datePicker.selected'),
  };
}
