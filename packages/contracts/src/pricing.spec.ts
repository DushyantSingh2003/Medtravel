import { describe, expect, it } from 'vitest';
import { money } from './money.js';
import {
  applyMargin,
  createFxOverrideSchema,
  discountBp,
  discountDecision,
  publishPriceSchema,
} from './pricing.js';

const thresholds = [
  { role: 'case_manager', maxBp: 500 },
  { role: 'finance', maxBp: 1000 },
  { role: 'super_admin', maxBp: 3000 },
] as const;

describe('applyMargin', () => {
  it('adds the margin to the cost and rounds to a whole minor unit', () => {
    expect(applyMargin(money(10_000, 'USD'), 1500)).toEqual(money(11_500, 'USD'));
    expect(applyMargin(money(333, 'USD'), 1000)).toEqual(money(366, 'USD'));
    expect(applyMargin(money(0, 'INR'), 2500)).toEqual(money(0, 'INR'));
  });
  it('rounds half to even, like every other money calculation', () => {
    expect(applyMargin(money(5, 'USD'), 1000).amountMinor).toBe(6);
    expect(applyMargin(money(25, 'USD'), 1000).amountMinor).toBe(28);
  });
  it('leaves the cost alone with no margin', () => {
    expect(applyMargin(money(12_345, 'AED'), 0)).toEqual(money(12_345, 'AED'));
  });
});

describe('discountBp', () => {
  it('is the discount as basis points of the total, rounded up so a limit is never slipped under', () => {
    expect(discountBp(money(100_000, 'USD'), money(5_000, 'USD'))).toBe(500);
    expect(discountBp(money(30_000, 'USD'), money(1, 'USD'))).toBe(1);
  });
  it('is zero without a discount or a total', () => {
    expect(discountBp(money(100, 'USD'), money(0, 'USD'))).toBe(0);
    expect(discountBp(money(0, 'USD'), money(10, 'USD'))).toBe(0);
  });
  it('refuses to compare two currencies', () => {
    expect(() => discountBp(money(100, 'USD'), money(10, 'INR'))).toThrow();
  });
});

describe('discountDecision', () => {
  it('lets a role give a discount up to its limit, inclusive', () => {
    expect(discountDecision(thresholds, 'case_manager', 500)).toEqual({
      allowed: true,
      limitBp: 500,
      approverRole: null,
    });
  });
  it('asks the lowest role with a high enough limit to approve more', () => {
    expect(discountDecision(thresholds, 'case_manager', 501)).toMatchObject({
      allowed: false,
      approverRole: 'finance',
    });
    expect(discountDecision(thresholds, 'case_manager', 2500)).toMatchObject({
      allowed: false,
      approverRole: 'super_admin',
    });
  });
  it('has no approver for a discount above every limit', () => {
    expect(discountDecision(thresholds, 'super_admin', 3001)).toEqual({
      allowed: false,
      limitBp: 3000,
      approverRole: null,
    });
  });
  it('does not let a role with no threshold discount at all', () => {
    expect(discountDecision(thresholds, 'patient', 1)).toMatchObject({
      allowed: false,
      limitBp: null,
    });
  });
});

describe('publishPriceSchema', () => {
  const price = (currency: string, amountMinor: number) => ({ currency, amountMinor });
  it('needs the base currency, because the others are converted from it', () => {
    expect(publishPriceSchema.safeParse({ prices: [price('USD', 100)] }).success).toBe(false);
    expect(publishPriceSchema.safeParse({ prices: [price('INR', 100)] }).success).toBe(true);
  });
  it('refuses a currency listed twice and a negative price', () => {
    expect(
      publishPriceSchema.safeParse({ prices: [price('INR', 1), price('INR', 2)] }).success,
    ).toBe(false);
    expect(publishPriceSchema.safeParse({ prices: [price('INR', -1)] }).success).toBe(false);
  });
});

describe('createFxOverrideSchema', () => {
  const base = { base: 'usd', quote: 'inr', rate: '83.5', reason: 'Bank rate this week' };
  it('upper-cases the codes and accepts a plain decimal', () => {
    expect(createFxOverrideSchema.parse(base)).toMatchObject({ base: 'USD', quote: 'INR' });
  });
  it('refuses zero, an exponent, the same currency twice and a missing reason', () => {
    expect(createFxOverrideSchema.safeParse({ ...base, rate: '0' }).success).toBe(false);
    expect(createFxOverrideSchema.safeParse({ ...base, rate: '1e3' }).success).toBe(false);
    expect(createFxOverrideSchema.safeParse({ ...base, quote: 'USD' }).success).toBe(false);
    expect(createFxOverrideSchema.safeParse({ ...base, reason: '' }).success).toBe(false);
  });
});
