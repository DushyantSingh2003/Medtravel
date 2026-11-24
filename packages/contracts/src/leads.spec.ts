import { describe, expect, it } from 'vitest';
import {
  NAME_HINT_THRESHOLD,
  createLeadSchema,
  nameSimilarity,
  normaliseEmail,
  normaliseName,
  normalisePassport,
  normalisePhone,
  phoneDigits,
  publicLeadSchema,
} from './leads.js';

describe('normalisePhone', () => {
  it('writes the same number the same way however it was typed', () => {
    for (const typed of ['+971 50 123 4567', '00971501234567', '+971-(50)-123.4567', ' +971501234567 '])
      expect(normalisePhone(typed), typed).toBe('+971501234567');
  });
  it('refuses what is not an international number', () => {
    for (const typed of ['0501234567', '12345', '+0123456789', 'abc', '', '+97150123456789012'])
      expect(normalisePhone(typed), typed).toBeNull();
  });
  it('compares by digits', () => {
    expect(phoneDigits('+971 50 123 4567')).toBe('971501234567');
  });
});

describe('normalising the other identifiers', () => {
  it('lower-cases an email and trims it', () => {
    expect(normaliseEmail('  Asha.Verma@Example.COM ')).toBe('asha.verma@example.com');
  });
  it('reads a passport as capital letters and digits', () => {
    expect(normalisePassport('a-123 456')).toBe('A123456');
    expect(normalisePassport('P<IND 99/88')).toBe('PIND9988');
  });
  it('compares names without accents, case or word order', () => {
    expect(normaliseName('  José  GARCÍA ')).toBe('garcia jose');
    expect(normaliseName('Verma, Asha')).toBe(normaliseName('asha verma'));
  });
});

describe('nameSimilarity', () => {
  it('is 1 for the same name in another order, and high for a small slip', () => {
    expect(nameSimilarity('Asha Verma', 'verma asha')).toBe(1);
    expect(nameSimilarity('Mohammed Al Farsi', 'Mohamed Al Farsi')).toBeGreaterThanOrEqual(NAME_HINT_THRESHOLD);
  });
  it('is low for different people and 0 for an empty name', () => {
    expect(nameSimilarity('Asha Verma', 'Omar Khan')).toBeLessThan(0.4);
    expect(nameSimilarity('', 'Omar Khan')).toBe(0);
  });
});

describe('lead schemas', () => {
  const base = { name: 'Asha Verma', phone: '+971 50 123 4567', message: 'Knee replacement' };
  it('normalises the phone and email on the way in', () => {
    const lead = createLeadSchema.parse({ ...base, email: 'ASHA@Example.com', source: 'phone' });
    expect(lead).toMatchObject({ phone: '+971501234567', email: 'asha@example.com' });
  });
  it('needs a phone or an email, and a phone in international form', () => {
    expect(createLeadSchema.safeParse({ name: 'Asha Verma', source: 'phone' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, phone: '0501234567', source: 'phone' }).success).toBe(false);
    expect(createLeadSchema.safeParse({ name: 'Asha Verma', email: 'asha@example.com', source: 'email' }).success).toBe(true);
  });
  it('turns a missing consent, token or contact away, and lets the controller handle a filled-in honeypot', () => {
    const form = { ...base, privacyAccepted: true, turnstileToken: 'token' };
    expect(publicLeadSchema.safeParse(form).success).toBe(true);
    // The hidden field is read by the controller, which answers a bot as if it had worked; the schema only bounds its size.
    expect(publicLeadSchema.safeParse({ ...form, companyWebsite: 'http://spam' }).success).toBe(true);
    expect(publicLeadSchema.safeParse({ ...form, language: 'klingon-xx' }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...form, privacyAccepted: false }).success).toBe(false);
    expect(publicLeadSchema.safeParse({ ...form, turnstileToken: '' }).success).toBe(false);
  });
  it('does not let the public form choose the source or send a passport number', () => {
    const parsed = publicLeadSchema.parse({
      ...base,
      privacyAccepted: true,
      turnstileToken: 'token',
      source: 'agent',
      passportNumber: 'A1',
    } as never);
    expect(parsed).not.toHaveProperty('source');
    expect(parsed).not.toHaveProperty('passportNumber');
  });
});
