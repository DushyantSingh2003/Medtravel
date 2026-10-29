import { describe, expect, it } from 'vitest';
import { money } from '@medtravel/contracts';
import { inCurrency } from './display-price';

const rates = { base: 'USD', rates: { INR: '83.25000000', AED: '3.67250000' } };

describe('inCurrency', () => {
  it('converts a dollar price into rupees and dirhams in whole minor units', () => {
    expect(inCurrency(money(150000, 'USD'), 'INR', rates)).toEqual(money(12487500, 'INR'));
    expect(inCurrency(money(150000, 'USD'), 'AED', rates)).toEqual(money(550875, 'AED'));
  });

  it('keeps a price already in the chosen currency', () => {
    expect(inCurrency(money(150000, 'USD'), 'USD', rates)).toEqual(money(150000, 'USD'));
  });

  it('gives up rather than guess when the rates are missing, for another base, or lack the currency', () => {
    expect(inCurrency(money(150000, 'USD'), 'INR', undefined)).toBeNull();
    expect(inCurrency(money(150000, 'EUR'), 'INR', rates)).toBeNull();
    expect(inCurrency(money(150000, 'USD'), 'EUR', rates)).toBeNull();
  });
});
