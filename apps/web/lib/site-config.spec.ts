import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageAlternates, siteUrl, whatsappLink } from './site-config';

describe('whatsappLink', () => {
  it('builds a wa.me link from digits, ignoring formatting', () => {
    expect(whatsappLink('919999900000')).toBe('https://wa.me/919999900000');
    expect(whatsappLink('+91 (99999) 00000')).toBe('https://wa.me/919999900000');
    expect(whatsappLink('+91-99999-00000')).toBe('https://wa.me/919999900000');
  });

  it('returns null, hiding the button, when the number is missing or not a phone number', () => {
    for (const value of [
      undefined,
      '',
      '   ',
      'call us',
      '123',
      '1234567890123456',
      '9199999x0000',
      'javascript:alert(1)',
    ]) {
      expect(whatsappLink(value), String(value)).toBeNull();
    }
  });
});

describe('siteUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the configured URL, and the local default when it is unset or empty', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://medtravel.example');
    expect(siteUrl().origin).toBe('https://medtravel.example');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(siteUrl().origin).toBe('http://localhost:3000');
  });
});

describe('languageAlternates', () => {
  it('points each language at its own copy of the path', () => {
    expect(languageAlternates('/treatments')).toEqual({
      en: '/en/treatments',
      ar: '/ar/treatments',
    });
    expect(languageAlternates('')).toEqual({ en: '/en', ar: '/ar' });
  });
});
