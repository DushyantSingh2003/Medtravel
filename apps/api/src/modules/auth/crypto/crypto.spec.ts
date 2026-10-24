import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-box.js';
import { signToken, verifyToken } from './signed-token.js';
import {
  normalizeBackupCode,
  randomBackupCode,
  randomCode,
  randomToken,
  safeEqual,
  sha256Hex,
} from './tokens.js';

const secret = 's'.repeat(40);

describe('tokens', () => {
  it('are random, long and URL safe', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('hash to a fixed, non-reversible form', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('compare in constant time and never accept different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('make six-digit codes, zero padded', () => {
    for (let i = 0; i < 200; i += 1) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it('make backup codes without look-alike characters, and read them back whatever the case or hyphen', () => {
    for (let i = 0; i < 100; i += 1)
      expect(randomBackupCode()).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode('ABCDEFGHJK')).toBe('ABCDEFGHJK');
  });
});

describe('signed tokens', () => {
  const payload = { typ: 'access', exp: Math.floor(Date.now() / 1000) + 60, sid: 'abc' };

  it('verify when untouched', () => {
    expect(verifyToken(secret, signToken(secret, payload), 'access')).toMatchObject({ sid: 'abc' });
  });

  it('refuse a tampered body, a wrong secret, a wrong type and an expired token', () => {
    const token = signToken(secret, payload);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, sid: 'evil' })).toString('base64url');
    expect(verifyToken(secret, `${forged}.${signature}`, 'access')).toBeNull();
    expect(verifyToken('x'.repeat(40), token, 'access')).toBeNull();
    expect(verifyToken(secret, token, 'two_factor')).toBeNull();
    expect(verifyToken(secret, token, 'access', Date.now() + 120_000)).toBeNull();
    expect(verifyToken(secret, `${body}.${signature}.extra`, 'access')).toBeNull();
    expect(verifyToken(secret, 'garbage', 'access')).toBeNull();
  });
});

describe('secret box', () => {
  const key = 'ab'.repeat(32);

  it('round-trips, with a fresh nonce every time', () => {
    const one = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(decryptSecret(key, one)).toBe('JBSWY3DPEHPK3PXP');
    expect(encryptSecret(key, 'JBSWY3DPEHPK3PXP')).not.toBe(one);
    expect(one).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('fails on a wrong key or a changed byte', () => {
    const stored = encryptSecret(key, 'secret');
    expect(() => decryptSecret('cd'.repeat(32), stored)).toThrow();
    expect(() => decryptSecret(key, `${stored.slice(0, -2)}AA`)).toThrow();
    expect(() => decryptSecret(key, 'nonsense')).toThrow();
  });
});
