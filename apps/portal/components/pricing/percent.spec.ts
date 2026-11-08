import { describe, expect, it } from 'vitest';
import { bpFromPercent, percentFromBp } from './percent';

describe('percentFromBp', () => {
  it('shows whole and fractional percentages without trailing zeros', () => {
    expect(percentFromBp(0)).toBe('0');
    expect(percentFromBp(1500)).toBe('15');
    expect(percentFromBp(1550)).toBe('15.5');
    expect(percentFromBp(1505)).toBe('15.05');
    expect(percentFromBp(1)).toBe('0.01');
  });
});

describe('bpFromPercent', () => {
  it('reads a percentage into whole basis points', () => {
    expect(bpFromPercent('15')).toBe(1500);
    expect(bpFromPercent('15.5')).toBe(1550);
    expect(bpFromPercent('0.05')).toBe(5);
    expect(bpFromPercent(' 2 ')).toBe(200);
  });
  it('refuses anything else', () => {
    for (const text of ['', 'abc', '1,5', '1e2', '-1', '1.234', '1000'])
      expect(bpFromPercent(text), text).toBeNull();
  });
  it('round-trips every basis point up to 100 %', () => {
    for (let bp = 0; bp <= 10_000; bp += 7) expect(bpFromPercent(percentFromBp(bp))).toBe(bp);
  });
});
