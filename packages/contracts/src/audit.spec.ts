import { describe, expect, it } from 'vitest';
import { MASK, auditListQuerySchema, diffAudit, maskSensitive } from './audit.js';

describe('maskSensitive', () => {
  it('replaces secrets, tokens and hashes entirely', () => {
    expect(
      maskSensitive({
        passwordHash: 'x',
        twoFactorSecret: 'y',
        refreshToken: 'z',
        challengeToken: 'z',
        code: '123456',
        otpCode: '1',
        name: 'Asha',
      }),
    ).toEqual({
      passwordHash: MASK,
      twoFactorSecret: MASK,
      refreshToken: MASK,
      challengeToken: MASK,
      code: MASK,
      otpCode: MASK,
      name: 'Asha',
    });
  });

  it('keeps the last four characters of a passport number', () => {
    expect(maskSensitive({ passportNumber: 'N1234567' })).toEqual({ passportNumber: '****4567' });
    expect(maskSensitive({ passportNumber: 'AB1' })).toEqual({ passportNumber: MASK });
  });

  it('hides date of birth, email, phone and address', () => {
    expect(
      maskSensitive({ dateOfBirth: '1990-01-01', email: 'a@b.c', phone: '+91', address: 'x', city: 'Delhi' }),
    ).toEqual({ dateOfBirth: MASK, email: MASK, phone: MASK, address: MASK, city: 'Delhi' });
  });

  it('goes into nested objects and arrays, and leaves null and plain values alone', () => {
    expect(
      maskSensitive({ user: { password: 'p', profile: [{ token: 't', ok: 1 }] }, passportNumber: null, n: 3 }),
    ).toEqual({ user: { password: MASK, profile: [{ token: MASK, ok: 1 }] }, passportNumber: null, n: 3 });
  });

  it('writes dates as ISO strings', () => {
    expect(maskSensitive({ at: new Date('2026-01-02T03:04:05.000Z') })).toEqual({ at: '2026-01-02T03:04:05.000Z' });
  });

  it('does not change its input', () => {
    const input = { password: 'p' };
    maskSensitive(input);
    expect(input.password).toBe('p');
  });
});

describe('diffAudit', () => {
  it('keeps only the fields that changed', () => {
    expect(diffAudit({ a: 1, b: 2, c: { x: 1 } }, { a: 1, b: 3, c: { x: 1 } })).toEqual({
      before: { b: 2 },
      after: { b: 3 },
    });
  });

  it('records added and removed fields on the side that has them', () => {
    expect(diffAudit({ a: 1 }, { a: 1, b: 2 })).toEqual({ before: {}, after: { b: 2 } });
    expect(diffAudit({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: { b: 2 }, after: {} });
  });

  it('keeps the whole side for a create or a delete', () => {
    expect(diffAudit(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
    expect(diffAudit({ a: 1 }, undefined)).toEqual({ before: { a: 1 }, after: null });
  });

  it('is empty when nothing changed', () => {
    expect(diffAudit({ a: [1, 2] }, { a: [1, 2] })).toEqual({ before: {}, after: {} });
  });
});

describe('auditListQuerySchema', () => {
  it('accepts the filters and rejects a bad id or date', () => {
    expect(
      auditListQuerySchema.safeParse({
        actor: 'asha',
        entityType: 'Document',
        action: 'document.',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-02T00:00:00+05:30',
      }).success,
    ).toBe(true);
    expect(auditListQuerySchema.safeParse({ actorId: 'nope' }).success).toBe(false);
    expect(auditListQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });
});
