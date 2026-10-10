import { describe, expect, it } from 'vitest';
import { currencyDigits, editableAmount, formatMinorUnits, parseMinorUnits } from './format';

describe('currencyDigits', () => {
  it('knows the minor-unit digits of common currencies', () => {
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('INR')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('KWD')).toBe(3);
  });
});

describe('parseMinorUnits (2 digits)', () => {
  const p = (text: string) => parseMinorUnits(text, 2);

  it('parses plain amounts into integer minor units', () => {
    expect(p('12')).toBe(1200);
    expect(p('12.5')).toBe(1250);
    expect(p('12.50')).toBe(1250);
    expect(p('0.05')).toBe(5);
    expect(p('.5')).toBe(50);
    expect(p('1234.56')).toBe(123456);
    expect(p('12.')).toBe(1200);
  });

  it('avoids floating point errors', () => {
    // 19.99 * 100 is 1998.9999999999998 as a float.
    expect(p('19.99')).toBe(1999);
    expect(p('1.15')).toBe(115);
    expect(p('4.35')).toBe(435);
  });

  it('accepts a comma with one or two digits as the decimal point', () => {
    expect(p('12,5')).toBe(1250);
    expect(p('12,50')).toBe(1250);
  });

  it('treats a lone comma followed by exactly three digits as thousands', () => {
    expect(p('1,234')).toBe(123400);
    expect(p('12,345')).toBe(1234500);
    expect(p('1,234,567')).toBe(123456700);
  });

  it('uses the last separator as the decimal point when both appear', () => {
    expect(p('1,234.56')).toBe(123456);
    expect(p('1.234,56')).toBe(123456);
    expect(p('1,234,567.89')).toBe(123456789);
    expect(p('1.234.567,89')).toBe(123456789);
  });

  it('accepts Indian digit grouping', () => {
    expect(p('12,34,567')).toBe(123456700);
    expect(p('12,34,567.50')).toBe(123456750);
  });

  it('REJECTS more fraction digits than the currency has, instead of guessing or rounding', () => {
    // "1.234" is 1.23 in some places and 1234 in others: do not guess.
    expect(p('1.234')).toBeNull();
    expect(p('1.239')).toBeNull();
    expect(p('0.999')).toBeNull();
    expect(p('12.345')).toBeNull();
    expect(p('1,2345')).toBeNull();
  });

  it('REJECTS malformed grouping', () => {
    expect(p('1.2.3')).toBeNull();
    expect(p('12.34.56')).toBeNull();
    expect(p('1,2.3')).toBeNull();
    expect(p('1,2,3')).toBeNull();
    expect(p('1,23,4')).toBeNull();
    expect(p('1234,567.89')).toBeNull();
    expect(p('1.234.56,7')).toBeNull();
    expect(p('1,,234')).toBeNull();
  });

  it('supports negative amounts for refunds and credit notes, and rejects a misplaced sign', () => {
    expect(p('-5')).toBe(-500);
    expect(p('-10.50')).toBe(-1050);
    expect(p('\u221210')).toBe(-1000);
    expect(p('5-')).toBeNull();
    expect(p('--5')).toBeNull();
    expect(p('1-0')).toBeNull();
  });

  it('ignores spaces and accepts Arabic-Indic digits', () => {
    expect(p(' 1 234.50 ')).toBe(123450);
    expect(p('١٢٣٫٤٥')).toBe(12345);
    expect(p('١٬٢٣٤٫٥٠')).toBe(123450);
  });

  it('returns null for empty or invalid text', () => {
    expect(p('')).toBeNull();
    expect(p('   ')).toBeNull();
    expect(p('abc')).toBeNull();
    expect(p('12abc')).toBeNull();
    expect(p('.')).toBeNull();
    expect(p(',')).toBeNull();
    expect(p('+5')).toBeNull();
    expect(p('1e5')).toBeNull();
  });

  it('returns null when the amount is not a safe integer', () => {
    expect(p('99999999999999999999')).toBeNull();
  });
});

describe('parseMinorUnits in other currencies', () => {
  it('JPY (no fraction): whole numbers only, and "1,234" is thousands', () => {
    expect(parseMinorUnits('1500', 0)).toBe(1500);
    expect(parseMinorUnits('1,234', 0)).toBe(1234);
    expect(parseMinorUnits('1,234,567', 0)).toBe(1234567);
    // A fraction in a currency that has none is rejected, never truncated to a smaller amount.
    expect(parseMinorUnits('1.5', 0)).toBeNull();
    expect(parseMinorUnits('1.234', 0)).toBeNull();
    expect(parseMinorUnits('1,5', 0)).toBeNull();
  });

  it('KWD (three decimals): a dot is the decimal point, and "1,234" is ambiguous so it is rejected', () => {
    expect(parseMinorUnits('1.500', 3)).toBe(1500);
    expect(parseMinorUnits('1.5', 3)).toBe(1500);
    expect(parseMinorUnits('12,5', 3)).toBe(12500);
    // 1.234 KWD or one thousand two hundred thirty-four? Do not guess a figure 1000 times out.
    expect(parseMinorUnits('1,234', 3)).toBeNull();
    expect(parseMinorUnits('1,234.567', 3)).toBe(1234567);
    expect(parseMinorUnits('1.2345', 3)).toBeNull();
  });
});

describe('formatMinorUnits', () => {
  it('formats minor units as a localised amount', () => {
    expect(formatMinorUnits(123456, 'USD')).toBe('$1,234.56');
    expect(formatMinorUnits(5, 'USD')).toBe('$0.05');
    expect(formatMinorUnits(0, 'USD')).toBe('$0.00');
    expect(formatMinorUnits(1500, 'JPY')).toContain('1,500');
  });

  it('formats negative amounts (refunds, credit notes)', () => {
    expect(formatMinorUnits(-1050, 'USD')).toBe('-$10.50');
  });

  it('uses Latin digits in Arabic', () => {
    expect(formatMinorUnits(123456, 'USD', 'ar')).toMatch(/1[,٬]234[.٫]56/);
    expect(formatMinorUnits(123456, 'USD', 'ar')).not.toMatch(/[٠-٩]/);
  });

  it('refuses anything that is not a safe integer instead of printing nonsense', () => {
    expect(() => formatMinorUnits(12.5, 'USD')).toThrow(RangeError);
    expect(() => formatMinorUnits(Number.NaN, 'USD')).toThrow(RangeError);
    expect(() => formatMinorUnits(1e21, 'USD')).toThrow(RangeError);
  });

  it('does not lose precision on large amounts', () => {
    expect(formatMinorUnits(900719925474099, 'USD')).toBe('$9,007,199,254,740.99');
  });
});

describe('editableAmount', () => {
  it('shows a plain decimal with no grouping', () => {
    expect(editableAmount(123456, 2)).toBe('1234.56');
    expect(editableAmount(5, 2)).toBe('0.05');
    expect(editableAmount(1500, 0)).toBe('1500');
    expect(editableAmount(-1050, 2)).toBe('-10.50');
  });

  it('round-trips through the parser', () => {
    for (const minor of [0, 1, 99, 100, 123456, 900719925474099]) {
      expect(parseMinorUnits(editableAmount(minor, 2), 2)).toBe(minor);
    }
  });
});
