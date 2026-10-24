import { describe, expect, it } from 'vitest';
import { readCookie, serializeCookie } from './cookies.js';

describe('readCookie', () => {
  it('finds one cookie among several, and not one whose name merely ends the same', () => {
    expect(readCookie('a=1; mt_at=tok; b=2', 'mt_at')).toBe('tok');
    expect(readCookie('x_mt_at=tok', 'mt_at')).toBeUndefined();
  });

  it('copes with a missing header and with equals signs inside a value', () => {
    expect(readCookie(undefined, 'a')).toBeUndefined();
    expect(readCookie('a=b=c', 'a')).toBe('b=c');
  });
});

describe('serializeCookie', () => {
  const base = { maxAgeSeconds: 900, httpOnly: true, path: '/', secure: false };

  it('is HttpOnly and SameSite=Lax, with an expiry', () => {
    expect(serializeCookie('mt_at', 'v', base)).toBe(
      'mt_at=v; Path=/; Max-Age=900; SameSite=Lax; HttpOnly',
    );
  });

  it('adds Secure and Domain only when asked, and leaves HttpOnly off for the CSRF cookie', () => {
    const header = serializeCookie('mt_csrf', 'v', {
      ...base,
      httpOnly: false,
      secure: true,
      domain: '.example.com',
    });
    expect(header).toContain('Secure');
    expect(header).toContain('Domain=.example.com');
    expect(header).not.toContain('HttpOnly');
  });
});
