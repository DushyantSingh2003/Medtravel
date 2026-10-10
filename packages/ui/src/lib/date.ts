/**
 * Date-only values (a birthday, a passport expiry, an arrival day) are calendar days, not instants.
 * Send them to the API as `YYYY-MM-DD` strings: a `Date` serialised with `JSON.stringify` becomes a
 * UTC instant, and in India (UTC+5:30) midnight on 5 January turns into 4 January on the server.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local calendar day of a Date as `YYYY-MM-DD`. */
export function toDateOnly(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A local-midnight Date for a `YYYY-MM-DD` string, or `undefined` when it is not a real calendar day. */
export function fromDateOnly(value: string | null | undefined): Date | undefined {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `new Date(2026, 1, 31)` rolls over to March; reject that.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}
