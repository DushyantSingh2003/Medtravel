import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStubAuthEnabled, parseSessionCookie } from './session-cookie';

describe('parseSessionCookie', () => {
  it('accepts exactly the known roles', () => {
    expect(parseSessionCookie('case_manager')).toBe('case_manager');
    expect(parseSessionCookie('super_admin')).toBe('super_admin');
  });

  it('rejects anything else, so a forged or stale cookie is signed out', () => {
    for (const value of [
      undefined,
      '',
      'admin',
      'SUPER_ADMIN',
      'doctor ',
      '{"role":"doctor"}',
      'constructor',
      '__proto__',
    ]) {
      expect(parseSessionCookie(value), String(value)).toBeNull();
    }
  });
});

describe('isStubAuthEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is off unless the flag is exactly "true"', () => {
    vi.stubEnv('ENABLE_STUB_AUTH', '');
    expect(isStubAuthEnabled()).toBe(false);
    vi.stubEnv('ENABLE_STUB_AUTH', '1');
    expect(isStubAuthEnabled()).toBe(false);
    vi.stubEnv('ENABLE_STUB_AUTH', 'TRUE');
    expect(isStubAuthEnabled()).toBe(false);
    vi.stubEnv('ENABLE_STUB_AUTH', 'true');
    expect(isStubAuthEnabled()).toBe(true);
  });
});
