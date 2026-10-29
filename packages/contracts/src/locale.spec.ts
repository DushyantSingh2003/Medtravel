import { describe, expect, it } from 'vitest';
import { fromAcceptLanguage, fromCountry, negotiateLocale } from './locale.js';

describe('negotiateLocale', () => {
  it('prefers the saved choice, then the browser, then the country, then English', () => {
    expect(negotiateLocale({ cookie: 'ar', acceptLanguage: 'en-US', country: 'IN' })).toBe('ar');
    expect(negotiateLocale({ cookie: 'en', acceptLanguage: 'ar', country: 'SA' })).toBe('en');
    expect(negotiateLocale({ acceptLanguage: 'ar-SA,en;q=0.5', country: 'IN' })).toBe('ar');
    expect(negotiateLocale({ acceptLanguage: 'fr-FR,fr;q=0.9', country: 'AE' })).toBe('ar');
    expect(negotiateLocale({ acceptLanguage: 'fr-FR', country: 'IN' })).toBe('en');
    expect(negotiateLocale({})).toBe('en');
  });

  it('ignores a cookie that is not a supported language', () => {
    expect(negotiateLocale({ cookie: 'klingon', acceptLanguage: 'ar' })).toBe('ar');
    expect(negotiateLocale({ cookie: '' })).toBe('en');
  });
});

describe('fromAcceptLanguage', () => {
  it('orders by weight, then position, and skips languages we do not have', () => {
    expect(fromAcceptLanguage('en;q=0.4, ar;q=0.9')).toBe('ar');
    expect(fromAcceptLanguage('de, ar-EG, en')).toBe('ar');
    expect(fromAcceptLanguage('ar;q=0, en;q=0.2')).toBe('en');
    expect(fromAcceptLanguage('*')).toBeNull();
    expect(fromAcceptLanguage('')).toBeNull();
    expect(fromAcceptLanguage(null)).toBeNull();
  });
});

describe('fromCountry', () => {
  it('gives Arabic for Arabic-speaking countries, in any case, and nothing for the rest', () => {
    for (const code of ['AE', 'sa', 'EG', 'KW', 'QA', 'OM', 'JO'])
      expect(fromCountry(code), code).toBe('ar');
    for (const code of ['IN', 'US', 'GB', 'NG', 'KE', '', null, undefined])
      expect(fromCountry(code), String(code)).toBeNull();
  });
});
