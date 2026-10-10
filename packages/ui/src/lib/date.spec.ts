import { describe, expect, it } from 'vitest';
import { fromDateOnly, toDateOnly } from './date';

describe('date-only helpers', () => {
  it('round-trips a calendar day regardless of the time zone', () => {
    const date = fromDateOnly('2026-01-05');
    expect(date).toBeDefined();
    expect(toDateOnly(date!)).toBe('2026-01-05');
  });

  it('pads small years, months and days', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rejects text that is not a real day', () => {
    expect(fromDateOnly('2026-02-31')).toBeUndefined();
    expect(fromDateOnly('2026-1-5')).toBeUndefined();
    expect(fromDateOnly('2026-01-05T00:00:00Z')).toBeUndefined();
    expect(fromDateOnly('')).toBeUndefined();
    expect(fromDateOnly(null)).toBeUndefined();
  });
});
