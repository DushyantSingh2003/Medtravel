import { describe, expect, it } from 'vitest';
import {
  MASTER_CREATE_SCHEMAS,
  MASTER_DEFINITIONS,
  MASTER_RESOURCES,
  MASTER_UPDATE_SCHEMAS,
  masterListQuerySchema,
} from './masters.js';

describe('master data contracts', () => {
  it('define every resource once', () => {
    expect(Object.keys(MASTER_DEFINITIONS).sort()).toEqual([...MASTER_RESOURCES].sort());
    expect(Object.keys(MASTER_CREATE_SCHEMAS).sort()).toEqual([...MASTER_RESOURCES].sort());
    expect(Object.keys(MASTER_UPDATE_SCHEMAS).sort()).toEqual([...MASTER_RESOURCES].sort());
  });

  it('never let an update invent a value: an empty update parses to an empty object', () => {
    for (const resource of MASTER_RESOURCES) {
      expect(MASTER_UPDATE_SCHEMAS[resource].parse({}), resource).toEqual({});
    }
  });

  it('fill the defaults on create: active, two decimals, left-to-right', () => {
    expect(MASTER_CREATE_SCHEMAS.currencies.parse({ code: 'USD', name: 'US dollar' })).toEqual({
      code: 'USD',
      name: 'US dollar',
      minorUnits: 2,
      active: true,
    });
    expect(MASTER_CREATE_SCHEMAS.languages.parse({ code: 'en', name: 'English' })).toMatchObject({
      rtl: false,
      active: true,
    });
  });

  it('refuse unknown fields on create and update', () => {
    const body = { slug: 'cardiology', name: 'Cardiology', surprise: 1 };
    expect(MASTER_CREATE_SCHEMAS.specialities.safeParse(body).success).toBe(false);
    expect(MASTER_UPDATE_SCHEMAS.specialities.safeParse({ surprise: 1 }).success).toBe(false);
  });

  it('keep codes immutable on update', () => {
    for (const resource of [
      'countries',
      'languages',
      'currencies',
      'document-types',
      'lost-reasons',
    ] as const) {
      expect(MASTER_UPDATE_SCHEMAS[resource].safeParse({ code: 'XX' }).success, resource).toBe(
        false,
      );
    }
  });

  it('check the shape of keys and codes', () => {
    const country = MASTER_CREATE_SCHEMAS.countries;
    expect(country.safeParse({ code: 'in', name: 'India' }).success).toBe(false);
    expect(country.safeParse({ code: 'IN', name: 'India', dialCode: '91' }).success).toBe(false);
    expect(country.safeParse({ code: 'IN', name: 'India', dialCode: '+91' }).success).toBe(true);
    expect(
      MASTER_CREATE_SCHEMAS.specialities.safeParse({ slug: 'Heart Care', name: 'x' }).success,
    ).toBe(false);
    expect(
      MASTER_CREATE_SCHEMAS['lost-reasons'].safeParse({ code: 'too-dear', name: 'x' }).success,
    ).toBe(false);
  });

  it('accept an Arabic translation and reject an unsupported language', () => {
    const body = {
      slug: 'knee-replacement',
      name: 'Knee replacement',
      specialityId: crypto.randomUUID(),
    };
    expect(
      MASTER_CREATE_SCHEMAS.treatments.safeParse({
        ...body,
        translations: { ar: { name: 'استبدال الركبة' } },
      }).success,
    ).toBe(true);
    expect(
      MASTER_CREATE_SCHEMAS.treatments.safeParse({ ...body, translations: { fr: { name: 'x' } } })
        .success,
    ).toBe(false);
  });

  it('turn the list query strings into typed values', () => {
    expect(masterListQuerySchema.parse({ active: 'false', limit: '10', q: ' heart ' })).toEqual({
      active: false,
      limit: 10,
      q: 'heart',
    });
    expect(masterListQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
    expect(masterListQuerySchema.safeParse({ sort: 'name;drop' }).success).toBe(false);
  });
});
