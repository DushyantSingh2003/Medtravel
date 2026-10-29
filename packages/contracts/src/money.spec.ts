import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  add,
  allocate,
  compare,
  convertMinor,
  convertMoney,
  currencyDigits,
  divideRounded,
  formatMoney,
  money,
  multiply,
  negate,
  parseDecimal,
  subtract,
  sum,
} from './money.js';

const usd = (cents: number) => money(cents, 'USD');
const inr = (paise: number) => money(paise, 'INR');

describe('money arithmetic', () => {
  it('adds and subtracts whole minor units, and refuses to mix currencies', () => {
    expect(add(usd(1050), usd(275))).toEqual(usd(1325));
    expect(subtract(usd(100), usd(250))).toEqual(usd(-150));
    expect(sum('USD', [usd(1), usd(2), usd(3)])).toEqual(usd(6));
    expect(sum('USD', [])).toEqual(usd(0));
    expect(() => add(usd(1), inr(1))).toThrow(MoneyError);
    expect(() => compare(usd(1), inr(1))).toThrow(/convert first/);
  });

  it('never holds a fraction, a float or an unsafe number', () => {
    expect(() => money(10.5, 'USD')).toThrow(MoneyError);
    expect(() => money(Number.NaN, 'USD')).toThrow(MoneyError);
    expect(() => money(2 ** 53, 'USD')).toThrow(MoneyError);
    expect(() => money(1, 'usd')).toThrow(MoneyError);
    expect(() => add(usd(Number.MAX_SAFE_INTEGER), usd(1))).toThrow(/too large/);
  });

  it('has no negative zero and compares', () => {
    expect(Object.is(negate(usd(0)).amountMinor, 0)).toBe(true);
    expect(negate(usd(5))).toEqual(usd(-5));
    expect(compare(usd(1), usd(2))).toBe(-1);
    expect(compare(usd(2), usd(2))).toBe(0);
    expect(compare(usd(3), usd(2))).toBe(1);
  });
});

describe('rounding', () => {
  it('rounds half to even by default, and as asked', () => {
    expect(
      [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5].map((v) => Number(divideRounded(BigInt(v * 10), 10n))),
    ).toEqual([0, 2, 2, 4, 0, -2, -2]);
    expect(Number(divideRounded(25n, 10n, 'half_up'))).toBe(3);
    expect(Number(divideRounded(-25n, 10n, 'half_up'))).toBe(-3);
    expect(Number(divideRounded(21n, 10n, 'up'))).toBe(3);
    expect(Number(divideRounded(-21n, 10n, 'up'))).toBe(-3);
    expect(Number(divideRounded(29n, 10n, 'down'))).toBe(2);
    expect(Number(divideRounded(-29n, 10n, 'down'))).toBe(-2);
    expect(() => divideRounded(1n, 0n)).toThrow(MoneyError);
  });
});

describe('multiply', () => {
  it('multiplies by an exact decimal, with no float error', () => {
    // 0.1 + 0.2 style traps: 10% of 3.30 is 0.33, 18% GST on 100.10 is 18.018 -> 18.02
    expect(multiply(usd(330), '0.1')).toEqual(usd(33));
    expect(multiply(inr(10010), '0.18')).toEqual(inr(1802));
    expect(multiply(usd(1999), '0.125')).toEqual(usd(250));
    expect(multiply(usd(1999), '0.125', 'down')).toEqual(usd(249));
    expect(multiply(usd(-1999), '0.125', 'up')).toEqual(usd(-250));
    expect(multiply(usd(100), { n: 1n, d: 3n })).toEqual(usd(33));
  });

  it('is exact for amounts a float would blur', () => {
    const big = usd(9_007_199_254_740_000);
    expect(multiply(big, '1')).toEqual(big);
    expect(multiply(big, '0.5')).toEqual(usd(4_503_599_627_370_000));
  });

  it('rejects ratios that are not plain decimals', () => {
    for (const bad of ['1e3', '1,5', 'abc', '', '.5', '1.', '--1'])
      expect(() => multiply(usd(1), bad), bad).toThrow(MoneyError);
    expect(parseDecimal('-3.50')).toEqual({ n: -350n, d: 100n });
  });
});

describe('allocate', () => {
  it('splits so the parts always add up to the whole', () => {
    expect(allocate(usd(100), [1, 1, 1]).map((m) => m.amountMinor)).toEqual([34, 33, 33]);
    expect(allocate(usd(5), [3, 7]).map((m) => m.amountMinor)).toEqual([2, 3]);
    expect(allocate(usd(-100), [1, 1, 1]).map((m) => m.amountMinor)).toEqual([-34, -33, -33]);
    expect(allocate(usd(0), [1, 2]).map((m) => m.amountMinor)).toEqual([0, 0]);
    expect(allocate(usd(10), [0, 1]).map((m) => m.amountMinor)).toEqual([0, 10]);
  });

  it('keeps the total for many random splits', () => {
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let round = 0; round < 300; round += 1) {
      const total = (next() % 2_000_000) - 1_000_000;
      const weights = Array.from({ length: 1 + (next() % 8) }, () => next() % 50);
      if (weights.every((w) => w === 0)) continue;
      const parts = allocate(usd(total), weights);
      expect(sum('USD', parts).amountMinor).toBe(total);
      parts.forEach((part, i) => {
        if (weights[i] === 0) expect(part.amountMinor).toBe(0);
      });
    }
  });

  it('refuses nothing to split to, negative weights and all-zero weights', () => {
    expect(() => allocate(usd(1), [])).toThrow(MoneyError);
    expect(() => allocate(usd(1), [-1, 2])).toThrow(MoneyError);
    expect(() => allocate(usd(1), [0, 0])).toThrow(/zero/);
    expect(() => allocate(usd(1), [1.5])).toThrow(MoneyError);
  });
});

describe('currencyDigits and conversion', () => {
  it('knows how many decimals a currency has', () => {
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('INR')).toBe(2);
    expect(currencyDigits('AED')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('KWD')).toBe(3);
  });

  it('converts with an exact decimal rate and the currencies’ own decimals', () => {
    // 100.00 USD at 83.25 INR per USD = 8,325.00 INR
    expect(convertMinor(10000, 2, 2, '83.25')).toBe(832500);
    // 8,325.00 INR back at 0.012012 -> 100.00 (rounded)
    expect(convertMinor(832500, 2, 2, '0.01201201')).toBe(10000);
    // 100.00 USD to JPY (0 decimals) at 150.4 = 15,040 yen
    expect(convertMinor(10000, 2, 0, '150.4')).toBe(15040);
    // 100.00 USD to KWD (3 decimals) at 0.307 = 30.700 KWD
    expect(convertMinor(10000, 2, 3, '0.307')).toBe(30700);
    // 1,000 JPY to USD at 0.0066 = 6.60 USD
    expect(convertMinor(1000, 0, 2, '0.0066')).toBe(660);
    expect(() => convertMinor(1, 2, 2, '0')).toThrow(MoneyError);
    expect(() => convertMinor(1, 2, 2, '-1')).toThrow(MoneyError);
  });

  it('converts a Money, and leaves the same currency alone', () => {
    expect(convertMoney(usd(10000), 'INR', '83.25')).toEqual(inr(832500));
    expect(convertMoney(usd(10000), 'USD', '1')).toEqual(usd(10000));
    expect(convertMoney(usd(10000), 'JPY', '150.4')).toEqual(money(15040, 'JPY'));
  });
});

describe('formatMoney', () => {
  it('shows a price in INR, USD and AED in English', () => {
    expect(formatMoney(inr(12500000), 'en')).toBe('₹1,25,000.00'.replace('1,25,000', '125,000'));
    expect(formatMoney(usd(150000), 'en')).toBe('$1,500.00');
    // A no-break space keeps the code and the number on one line.
    expect(formatMoney(money(550000, 'AED'), 'en')).toBe('AED\u00a05,500.00');
  });

  it('shows the same prices in Arabic with Latin digits', () => {
    const inArabic = (m: ReturnType<typeof money>) => formatMoney(m, 'ar');
    for (const m of [inr(12500000), usd(150000), money(550000, 'AED')]) {
      const text = inArabic(m);
      expect(text, text).not.toMatch(/[٠-٩]/);
      expect(text).toMatch(/\d/);
    }
    expect(inArabic(usd(150000))).toContain('1,500.00');
    expect(inArabic(money(550000, 'AED'))).toContain('5,500.00');
    expect(inArabic(inr(12500000))).toContain('125,000.00');
  });

  it('uses the currency’s own decimals, trims zero decimals on request, and shows negatives', () => {
    expect(formatMoney(money(1500, 'JPY'), 'en')).toBe('¥1,500');
    expect(formatMoney(money(1234500, 'KWD'), 'en')).toBe('KWD\u00a01,234.500');
    expect(formatMoney(usd(150000), 'en', { trimZeroDecimals: true })).toBe('$1,500');
    expect(formatMoney(usd(150050), 'en', { trimZeroDecimals: true })).toBe('$1,500.50');
    expect(formatMoney(usd(-1999), 'en')).toBe('-$19.99');
    expect(formatMoney(usd(150000), 'en', { display: 'code' })).toMatch(/USD\s?1,500\.00/);
    expect(formatMoney(usd(0), 'en')).toBe('$0.00');
  });

  it('is exact for amounts beyond what a float holds', () => {
    expect(formatMoney(usd(9_007_199_254_740_991), 'en')).toBe('$90,071,992,547,409.91');
  });

  it('has a compact form', () => {
    expect(formatMoney(usd(150000000), 'en', { compact: true })).toBe('$1.5M');
  });
});
