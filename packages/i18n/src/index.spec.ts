import { describe, expect, it } from 'vitest';
import { LOCALES, directionOf, isLocale } from './index.js';

describe('i18n', () => {
  it('ships English and Arabic', () => {
    expect([...LOCALES]).toEqual(['en', 'ar']);
  });

  it('reports Arabic as right-to-left', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });

  it('narrows route segments to supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
