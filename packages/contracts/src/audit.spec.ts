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
      maskSensitive({
        dateOfBirth: '1990-01-01',
        email: 'a@b.c',
        phone: '+91',
        address: 'x',
        city: 'Delhi',
      }),
    ).toEqual({ dateOfBirth: MASK, email: MASK, phone: MASK, address: MASK, city: 'Delhi' });
  });

  it('goes into nested objects and arrays, and leaves null and plain values alone', () => {
    expect(
      maskSensitive({
        user: { password: 'p', profile: [{ token: 't', ok: 1 }] },
        passportNumber: null,
        n: 3,
      }),
    ).toEqual({
      user: { password: MASK, profile: [{ token: MASK, ok: 1 }] },
      passportNumber: null,
      n: 3,
    });
  });

  it('writes dates as ISO strings', () => {
    expect(maskSensitive({ at: new Date('2026-01-02T03:04:05.000Z') })).toEqual({
      at: '2026-01-02T03:04:05.000Z',
    });
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

describe('maskSensitive, more keys', () => {
  it('masks contact variants, medical text and identifiers', () => {
    const masked = maskSensitive({
      birthDate: '1990-01-01',
      phoneNumber: '+91',
      mobile: '9',
      whatsappNumber: '9',
      contactEmail: 'a@b.c',
      emailAddress: 'a@b.c',
      addressLine1: 'x',
      street: 'y',
      diagnosis: 'text',
      medicalNotes: 'text',
      symptoms: 'text',
      medicalHistory: 'text',
      allergies: 'text',
      aadhaarNumber: '1',
      cardNumber: '4',
      cvv: '1',
      iban: 'X',
      accountNumber: '1',
      passport: 'N1234567',
      passportNumberEncrypted: 'zzz',
      footprint: 'kept',
      stage: 'enquiry',
    }) as Record<string, unknown>;
    for (const key of Object.keys(masked)) {
      if (key === 'footprint') expect(masked[key]).toBe('kept');
      else if (key === 'stage') expect(masked[key]).toBe('enquiry');
      else expect(masked[key], key).toBe(MASK);
    }
  });

  it('writes bigint and decimal-like values as strings and hides binary values', () => {
    expect(
      maskSensitive({ amount: 12n, price: { toJSON: () => '1.50' }, blob: new Uint8Array([1]) }),
    ).toEqual({
      amount: '12',
      price: '1.50',
      blob: MASK,
    });
  });
});

describe('diffAudit, more cases', () => {
  it('ignores the order of keys inside nested values and copes with bigint', () => {
    expect(diffAudit({ a: { x: 1, y: 2 }, n: 1n }, { a: { y: 2, x: 1 }, n: 1n })).toEqual({
      before: {},
      after: {},
    });
    expect(diffAudit({ n: 1n }, { n: 2n })).toEqual({ before: { n: 1n }, after: { n: 2n } });
  });
});

describe('auditListQuerySchema actor', () => {
  it('needs at least three characters', () => {
    expect(auditListQuerySchema.safeParse({ actor: 'ab' }).success).toBe(false);
    expect(auditListQuerySchema.safeParse({ actor: 'abc' }).success).toBe(true);
  });
});
