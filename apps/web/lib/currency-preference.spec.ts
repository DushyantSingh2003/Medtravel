import { describe, expect, it } from 'vitest';
import { CURRENCY_COOKIE, currencyCookie, readCurrency } from './currency-preference';

describe('currency preference cookie', () => {
  it('defaults to US dollars when there is no cookie', () => {
    expect(readCurrency('')).toBe('USD');
    expect(readCurrency('theme=dark; lang=en')).toBe('USD');
  });

  it('reads the chosen currency among other cookies', () => {
    expect(readCurrency(`a=1; ${CURRENCY_COOKIE}=AED; b=2`)).toBe('AED');
    expect(readCurrency(`${CURRENCY_COOKIE}=INR`)).toBe('INR');
  });

  it('ignores a value that is not one of the four display currencies', () => {
    expect(readCurrency(`${CURRENCY_COOKIE}=GBP`)).toBe('USD');
    expect(readCurrency(`${CURRENCY_COOKIE}=usd`)).toBe('USD');
    expect(readCurrency(`${CURRENCY_COOKIE}=`)).toBe('USD');
  });

  it('writes a year-long, site-wide, same-site cookie that reads back', () => {
    const cookie = currencyCookie('EUR');
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('max-age=31536000');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(readCurrency(cookie.split(';')[0]!)).toBe('EUR');
  });
});
