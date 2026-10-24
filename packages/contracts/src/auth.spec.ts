import { describe, expect, it } from 'vitest';
import {
  MANDATORY_TWO_FACTOR_ROLES,
  canInvite,
  canSignInWithOtp,
  emailSchema,
  identifierSchema,
  passwordSchema,
  registerSchema,
  requiresTwoFactor,
} from './auth.js';
import { ROLES } from './roles.js';

describe('who needs a second factor', () => {
  it('is every staff, hospital and admin role, and none of the people outside the company', () => {
    expect([...MANDATORY_TWO_FACTOR_ROLES].sort()).toEqual(
      [
        'case_manager',
        'ground_coordinator',
        'interpreter',
        'medical_reviewer',
        'finance',
        'hospital_desk',
        'doctor',
        'super_admin',
      ].sort(),
    );
    for (const role of ['patient', 'attendant', 'agent'] as const)
      expect(requiresTwoFactor(role)).toBe(false);
  });

  it('never overlaps with who may sign in by code alone', () => {
    for (const role of ROLES)
      expect(requiresTwoFactor(role) && canSignInWithOtp(role), role).toBe(false);
  });
});

describe('who may invite whom', () => {
  it('lets the admin invite staff and hospital users, a hospital its own, a patient attendants, and nobody else anyone', () => {
    expect(canInvite('super_admin', 'case_manager')).toBe(true);
    expect(canInvite('super_admin', 'doctor')).toBe(true);
    expect(canInvite('hospital_desk', 'doctor')).toBe(true);
    expect(canInvite('hospital_desk', 'case_manager')).toBe(false);
    expect(canInvite('patient', 'attendant')).toBe(true);
    expect(canInvite('patient', 'patient')).toBe(false);
    for (const role of ROLES.filter(
      (r) => !['super_admin', 'hospital_desk', 'patient'].includes(r),
    )) {
      for (const invited of ROLES)
        expect(canInvite(role, invited), `${role} -> ${invited}`).toBe(false);
    }
  });

  it('never lets a hospital or a patient create a super admin', () => {
    expect(canInvite('hospital_desk', 'super_admin')).toBe(false);
    expect(canInvite('patient', 'super_admin')).toBe(false);
  });
});

describe('field rules', () => {
  it('lowercase and trim an email, and refuse a malformed one', () => {
    expect(emailSchema.parse('  Asha@Example.COM ')).toBe('asha@example.com');
    expect(emailSchema.safeParse('asha').success).toBe(false);
  });

  it('take an email or a phone number with its country code as an identifier', () => {
    expect(identifierSchema.safeParse('asha@example.com').success).toBe(true);
    expect(identifierSchema.safeParse('+96891234567').success).toBe(true);
    expect(identifierSchema.safeParse('91234567').success).toBe(false);
  });

  it('require ten characters with a letter and a digit', () => {
    expect(passwordSchema.safeParse('Dev@12345').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('1234567890123').success).toBe(false);
    expect(passwordSchema.safeParse('a-long-pass-1').success).toBe(true);
    expect(passwordSchema.safeParse(`${'a'.repeat(128)}1`).success).toBe(false);
  });

  it('refuse a role or any other field in the sign-up body', () => {
    const body = { name: 'A', email: 'a@b.co', password: 'a-long-pass-1' };
    expect(registerSchema.safeParse(body).success).toBe(true);
    expect(registerSchema.safeParse({ ...body, role: 'super_admin' }).success).toBe(false);
  });
});
