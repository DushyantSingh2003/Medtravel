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
  });

  it('avoids floating point errors', () => {
    // 0.1 + 0.2 style traps: 19.99 * 100 is 1998.9999999999998 as a float.
    expect(p('19.99')).toBe(1999);
    expect(p('1.15')).toBe(115);
    expect(p('4.35')).toBe(435);
  });

  it('truncates extra fraction digits instead of rounding', () => {
    expect(p('1.239')).toBe(123);
    expect(p('0.999')).toBe(99);
  });

  it('treats a lone comma followed by three digits as thousands', () => {
    expect(p('1,234')).toBe(123400);
    expect(p('1,234,567')).toBe(123456700);
  });

  it('treats a comma with one or two digits after it as the decimal point', () => {
    expect(p('12,5')).toBe(1250);
    expect(p('12,50')).toBe(1250);
  });

  it('treats a lone dot as the decimal point, even with three digits after it', () => {
    expect(p('1.234')).toBe(123);
  });

  it('uses the last separator as the decimal point when both appear', () => {
    expect(p('1,234.56')).toBe(123456);
    expect(p('1.234,56')).toBe(123456);
  });

  it('ignores spaces and accepts Arabic-Indic digits', () => {
    expect(p(' 1 234.50 ')).toBe(123450);
    expect(p('١٢٣٫٤٥')).toBe(12345);
  });

  it('returns null for empty or invalid text', () => {
    expect(p('')).toBeNull();
    expect(p('   ')).toBeNull();
    expect(p('abc')).toBeNull();
    expect(p('12abc')).toBeNull();
    expect(p('-5')).toBeNull();
    expect(p('.')).toBeNull();
  });

  it('returns null when the amount is not a safe integer', () => {
    expect(p('99999999999999999999')).toBeNull();
  });

  it('handles zero-decimal and three-decimal currencies', () => {
    expect(parseMinorUnits('1500', 0)).toBe(1500);
    expect(parseMinorUnits('1.500', 3)).toBe(1500);
    expect(parseMinorUnits('1,234', 3)).toBe(1234);
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
