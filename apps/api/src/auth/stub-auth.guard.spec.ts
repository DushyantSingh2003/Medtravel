import { describe, expect, it } from 'vitest';
import { readCookie } from './stub-auth.guard.js';

describe('readCookie', () => {
  it('finds one cookie among several', () => {
    expect(readCookie('a=1; mt_stub_session=doctor; b=2', 'mt_stub_session')).toBe('doctor');
  });

  it('does not match a cookie whose name merely ends with the name', () => {
    expect(readCookie('x_mt_stub_session=doctor', 'mt_stub_session')).toBeUndefined();
  });

  it('copes with a missing header and with values that contain an equals sign', () => {
    expect(readCookie(undefined, 'a')).toBeUndefined();
    expect(readCookie('a=b=c', 'a')).toBe('b=c');
  });
});
