import { describe, expect, it } from 'vitest';
import { CITIES } from '../prisma/seed-data/cities.ts';
import { seedCountries } from '../prisma/seed-data/countries.ts';
import { CURRENCIES } from '../prisma/seed-data/currencies.ts';
import { DOCUMENT_TYPES } from '../prisma/seed-data/document-types.ts';
import { LANGUAGES } from '../prisma/seed-data/languages.ts';
import { LOST_REASONS } from '../prisma/seed-data/lost-reasons.ts';
import { SPECIALITIES } from '../prisma/seed-data/specialities.ts';
import { TREATMENTS } from '../prisma/seed-data/treatments.ts';

const unique = (values: string[]) => new Set(values).size === values.length;

describe('seed data (F-02)', () => {
  it('has the sizes the task asks for', () => {
    expect(LANGUAGES).toHaveLength(10);
    expect(CURRENCIES.map((c) => c.code)).toEqual([
      'USD',
      'EUR',
      'GBP',
      'INR',
      'AED',
      'SAR',
      'OMR',
      'IQD',
      'UZS',
      'KES',
      'NGN',
    ]);
    expect(SPECIALITIES).toHaveLength(25);
    expect(TREATMENTS).toHaveLength(60);
    expect(CITIES).toHaveLength(15);
    expect(seedCountries().length).toBeGreaterThanOrEqual(240);
  });

  it('has no duplicate keys', () => {
    expect(unique(CURRENCIES.map((c) => c.code))).toBe(true);
    expect(unique(LANGUAGES.map((l) => l.code))).toBe(true);
    expect(unique(seedCountries().map((c) => c.code))).toBe(true);
    expect(unique(SPECIALITIES.map((s) => s[0]))).toBe(true);
    expect(unique(TREATMENTS.map((t) => t[0]))).toBe(true);
    expect(unique(CITIES.map((c) => c[0]))).toBe(true);
    expect(unique(DOCUMENT_TYPES.map((d) => d[0]))).toBe(true);
    expect(unique(LOST_REASONS.map((r) => r[0]))).toBe(true);
  });

  it('puts every treatment under a speciality, and every speciality has at least one', () => {
    const specialities = new Set(SPECIALITIES.map((s) => s[0]));
    for (const [slug, speciality] of TREATMENTS)
      expect(specialities.has(speciality), slug).toBe(true);
    const used = new Set(TREATMENTS.map((t) => t[1]));
    for (const [slug] of SPECIALITIES) expect(used.has(slug), slug).toBe(true);
  });

  it('gives every country an ISO code, a dialling code and an Arabic name', () => {
    for (const country of seedCountries()) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.dialCode, country.code).toMatch(/^\+\d{1,4}$/);
      expect(country.arabic, country.code).toMatch(/\p{Script=Arabic}/u);
    }
    expect(seedCountries().find((c) => c.code === 'OM')).toMatchObject({
      name: 'Oman',
      dialCode: '+968',
      region: 'Gulf',
    });
  });

  it('writes slugs and codes the admin API would accept', () => {
    for (const [slug] of [...SPECIALITIES, ...TREATMENTS, ...CITIES])
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const [code] of [...DOCUMENT_TYPES, ...LOST_REASONS])
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('has an Arabic name for every translated row, and Arabic switched on in the languages', () => {
    for (const row of [
      ...SPECIALITIES,
      ...TREATMENTS,
      ...CITIES,
      ...DOCUMENT_TYPES,
      ...LOST_REASONS,
    ]) {
      expect(row.at(3) ?? row[2], String(row[0])).toMatch(/\p{Script=Arabic}/u);
    }
    expect(LANGUAGES.find((l) => l.code === 'ar')).toMatchObject({ rtl: true, active: true });
  });
});
