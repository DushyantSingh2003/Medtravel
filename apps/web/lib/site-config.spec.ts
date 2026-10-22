import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSiteUrlConfigured,
  languageAlternates,
  pageAlternates,
  siteUrl,
  whatsappLink,
} from './site-config';

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

describe('isSiteUrlConfigured and siteUrl errors', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('counts an empty value (the Docker build default) as not configured', () => {
    expect(isSiteUrlConfigured('')).toBe(false);
    expect(isSiteUrlConfigured(undefined)).toBe(false);
    expect(isSiteUrlConfigured('https://medtravel.example')).toBe(true);
  });

  it('explains a value that is not a full URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'medtravel.example');
    expect(() => siteUrl()).toThrow(/full URL/);
  });
});

describe('pageAlternates', () => {
  it('gives the page its own canonical address, each language, and an English default', () => {
    expect(pageAlternates('ar', '/treatments')).toEqual({
      canonical: '/ar/treatments',
      languages: { en: '/en/treatments', ar: '/ar/treatments', 'x-default': '/en/treatments' },
    });
    expect(pageAlternates('en', '').canonical).toBe('/en');
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
