/** Staff screens show Indian time unless the person chose another (CLAUDE.md); the database keeps UTC. */
export const OPS_TIME_ZONE = 'Asia/Kolkata';

/** A valid IANA zone name, or the fallback (a person's saved zone can be missing or stale). */
export function resolveTimeZone(
  zone: string | null | undefined,
  fallback: string = OPS_TIME_ZONE,
): string {
  if (!zone) return fallback;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return fallback;
  }
}

/** Minutes the zone is ahead of UTC at an instant (+330 for India; changes with daylight saving). */
export function zoneOffsetMinutes(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant a calendar day (`YYYY-MM-DD`) starts or ends in a zone, as ISO UTC text: for filters ("from 3 March" means 00:00
 * in Delhi, not in UTC). Correct across daylight-saving changes.
 */
export function dayBoundary(
  day: string,
  edge: 'start' | 'end',
  zone: string = OPS_TIME_ZONE,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Not a day: ${day}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    throw new RangeError(`Not a day: ${day}`);
  const wall =
    edge === 'start' ? Date.UTC(y, m - 1, d, 0, 0, 0, 0) : Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // The offset depends on the instant being sought: settle it in two steps.
  let instant = wall - zoneOffsetMinutes(new Date(wall), zone) * 60_000;
  instant = wall - zoneOffsetMinutes(new Date(instant), zone) * 60_000;
  return new Date(instant).toISOString();
}

type Locale = 'en' | 'ar';
const tag = (locale: Locale) => (locale === 'ar' ? 'ar-u-nu-latn' : 'en');

export function formatDateTime(
  value: Date | string,
  locale: Locale,
  zone: string = OPS_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: resolveTimeZone(zone),
  }).format(new Date(value));
}

export function formatDate(
  value: Date | string,
  locale: Locale,
  zone: string = OPS_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(tag(locale), {
    dateStyle: 'medium',
    timeZone: resolveTimeZone(zone),
  }).format(new Date(value));
}

/** The calendar day (`YYYY-MM-DD`) an instant falls on in a zone. */
export function dayOf(value: Date | string, zone: string = OPS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(zone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
  return parts;
}
