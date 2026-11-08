import { describe, expect, it } from 'vitest';
import { diffText, percentOfBp } from './format';

describe('diffText', () => {
  it('shows an empty value as the placeholder', () => {
    expect(diffText('website', null, null, 'en', '—')).toBe('—');
    expect(diffText('website', '', null, 'en', '—')).toBe('—');
  });
  it('shows a price as money in its currency', () => {
    expect(diffText('priceMinor', 450_000, 'USD', 'en', '—')).toBe('$4,500.00');
  });
  it('shows other values as they are', () => {
    expect(diffText('bedCount', 150, null, 'en', '—')).toBe('150');
    expect(diffText('name', 'Apollo', null, 'en', '—')).toBe('Apollo');
  });
});

describe('percentOfBp', () => {
  it('formats a referral fee', () => {
    expect(percentOfBp(1250)).toBe('12.5%');
    expect(percentOfBp(1000)).toBe('10%');
    expect(percentOfBp(125)).toBe('1.25%');
  });
});
