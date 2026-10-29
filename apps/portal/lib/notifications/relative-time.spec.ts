import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('relativeTime', () => {
  it('says "now" for the last few seconds and minutes, hours and days after that', () => {
    expect(relativeTime(ago(10), 'en', NOW)).toBe('now');
    expect(relativeTime(ago(5 * 60), 'en', NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(3 * 3600), 'en', NOW)).toBe('3 hours ago');
    expect(relativeTime(ago(2 * 86_400), 'en', NOW)).toBe('2 days ago');
  });

  it('switches to a date after a week', () => {
    expect(relativeTime(ago(10 * 86_400), 'en', NOW)).toBe('Oct 19, 2026');
  });

  it('writes Arabic with Latin digits when given the Latin-digit locale', () => {
    expect(relativeTime(ago(5 * 60), 'ar-u-nu-latn', NOW)).toMatch(/5/);
    expect(relativeTime(ago(5 * 60), 'ar-u-nu-latn', NOW)).not.toMatch(/[٠-٩]/);
  });
});
