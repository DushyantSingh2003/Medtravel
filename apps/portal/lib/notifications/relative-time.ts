/** "5 minutes ago" for recent times, a date after a week. Latin digits in Arabic (CLAUDE.md), through the caller's `Intl` locale. */
export function relativeTime(iso: string, intlLocale: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return formatter.format(0, 'second');
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86_400) return formatter.format(Math.round(seconds / 86_400), 'day');
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium' }).format(new Date(iso));
}
