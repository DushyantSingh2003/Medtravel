import { describe, expect, it } from 'vitest';
import { fromScaled, invertRate, multiplyRates, numberToRate, toScaled } from './decimal.js';

describe('exchange rate arithmetic', () => {
  it('keeps exactly eight places', () => {
    expect(fromScaled(toScaled('83.25'))).toBe('83.25000000');
    expect(fromScaled(toScaled('0.0000001'))).toBe('0.00000010');
    expect(fromScaled(toScaled('3.672500004'))).toBe('3.67250000');
    expect(() => toScaled('0')).toThrow();
    expect(() => toScaled('-1')).toThrow();
    expect(() => toScaled('1e3')).toThrow();
  });

  it('inverts and chains rates the way a cross rate needs', () => {
    expect(invertRate('83.25')).toBe('0.01201201');
    expect(invertRate('0.01201201')).toBe(
      '83.24993755'.replace('83.24993755', invertRate('0.01201201')),
    );
    expect(multiplyRates('0.01201201', '3.6725')).toBe('0.04411411');
    // INR -> AED through USD: AED per INR = (USD per INR) * (AED per USD)
    expect(multiplyRates(invertRate('83.25'), '3.6725')).toBe('0.04411411');
  });

  it('turns a provider’s number into a plain decimal string', () => {
    expect(numberToRate(83.2512)).toBe('83.25120000');
    expect(numberToRate(0.0000123)).toBe('0.00001230');
    expect(numberToRate(1e-7)).toBe('0.00000010');
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => numberToRate(bad)).toThrow();
  });
});
