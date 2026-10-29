import { describe, expect, it } from 'vitest';
import {
  OPS_TIME_ZONE,
  dayBoundary,
  dayOf,
  formatDate,
  formatDateTime,
  resolveTimeZone,
  zoneOffsetMinutes,
} from './time.js';

describe('time zones', () => {
  it('defaults staff screens to Indian time and ignores a stale zone name', () => {
    expect(OPS_TIME_ZONE).toBe('Asia/Kolkata');
    expect(resolveTimeZone(null)).toBe('Asia/Kolkata');
    expect(resolveTimeZone('Not/AZone')).toBe('Asia/Kolkata');
    expect(resolveTimeZone('Asia/Dubai')).toBe('Asia/Dubai');
    expect(resolveTimeZone('', 'UTC')).toBe('UTC');
  });

  it('knows a zone’s offset at an instant, including daylight saving', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Asia/Dubai')).toBe(240);
    expect(zoneOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Europe/London')).toBe(0);
    expect(zoneOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'Europe/London')).toBe(60);
    expect(zoneOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'America/New_York')).toBe(-240);
  });
});

describe('dayBoundary', () => {
  it('starts and ends a day in Delhi at the right UTC instants', () => {
    expect(dayBoundary('2026-03-03', 'start')).toBe('2026-03-02T18:30:00.000Z');
    expect(dayBoundary('2026-03-03', 'end')).toBe('2026-03-03T18:29:59.999Z');
  });

  it('works in the Gulf and in a zone with daylight saving, on the days the clocks change', () => {
    expect(dayBoundary('2026-03-03', 'start', 'Asia/Dubai')).toBe('2026-03-02T20:00:00.000Z');
    // London: clocks go forward on 29 March 2026 (a 23-hour day).
    expect(dayBoundary('2026-03-29', 'start', 'Europe/London')).toBe('2026-03-29T00:00:00.000Z');
    expect(dayBoundary('2026-03-29', 'end', 'Europe/London')).toBe('2026-03-29T22:59:59.999Z');
    // and back on 25 October (a 25-hour day).
    expect(dayBoundary('2026-10-25', 'start', 'Europe/London')).toBe('2026-10-24T23:00:00.000Z');
    expect(dayBoundary('2026-10-25', 'end', 'Europe/London')).toBe('2026-10-25T23:59:59.999Z');
  });

  it('rejects text that is not a day', () => {
    for (const bad of ['2026-3-3', 'yesterday', '', '2026-03-03T10:00'])
      expect(() => dayBoundary(bad, 'start')).toThrow(RangeError);
  });
});

describe('formatting and dayOf', () => {
  it('shows a time in the viewer’s zone and language, with Latin digits in Arabic', () => {
    const at = '2026-03-03T18:30:00Z';
    expect(formatDateTime(at, 'en', 'Asia/Kolkata')).toMatch(/Mar 4, 2026/);
    expect(formatDateTime(at, 'en', 'UTC')).toMatch(/Mar 3, 2026/);
    expect(formatDate(at, 'ar', 'Asia/Kolkata')).not.toMatch(/[٠-٩]/);
    expect(formatDate(at, 'en', 'Bad/Zone')).toMatch(/Mar 4, 2026/);
  });

  it('names the calendar day an instant falls on in a zone', () => {
    expect(dayOf('2026-03-03T18:30:00Z', 'Asia/Kolkata')).toBe('2026-03-04');
    expect(dayOf('2026-03-03T18:30:00Z', 'UTC')).toBe('2026-03-03');
  });
});
