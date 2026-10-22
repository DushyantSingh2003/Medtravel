import {
  MASTER_CREATE_SCHEMAS,
  MASTER_UPDATE_SCHEMAS,
  type MasterResource,
} from '@medtravel/contracts';
import type { MasterRowDto } from '@medtravel/api-client';
import { describe, expect, it } from 'vitest';
import { changedFields, initialValues, toPayload } from './master-form-values';

const treatmentRow: MasterRowDto = {
  id: '0e772ec9-6cdd-42fe-855c-7c5f261ed91f',
  slug: 'knee-replacement',
  name: 'Knee replacement',
  summary: 'Total knee arthroplasty',
  typicalStayDays: 10,
  specialityId: '8e8eaacf-4bba-4083-9348-06d5075cbe15',
  speciality: { id: '8e8eaacf-4bba-4083-9348-06d5075cbe15', name: 'Orthopaedics' },
  active: true,
  deletedAt: null,
  createdAt: '2026-10-22T17:08:12.452Z',
  updatedAt: '2026-10-22T17:08:12.452Z',
  translations: { ar: { name: 'استبدال مفصل الركبة', summary: null } },
};

describe('initialValues', () => {
  it('starts a new row active, with empty text and two decimals for a currency', () => {
    expect(initialValues('treatments')).toMatchObject({
      active: true,
      slug: '',
      name: '',
      typicalStayDays: '',
      translations: { ar: { name: '', summary: '' } },
    });
    expect(initialValues('currencies')).toMatchObject({ minorUnits: '2', code: '' });
    expect(initialValues('languages')).toMatchObject({ rtl: false });
  });

  it('fills the form from the row, nulls becoming empty text', () => {
    expect(initialValues('treatments', treatmentRow)).toMatchObject({
      slug: 'knee-replacement',
      typicalStayDays: '10',
      translations: { ar: { name: 'استبدال مفصل الركبة', summary: '' } },
    });
  });
});

describe('toPayload', () => {
  it('turns blanks into nulls, numbers into numbers and drops an Arabic name nobody typed', () => {
    const values = {
      ...initialValues('treatments'),
      slug: ' bypass ',
      name: 'Bypass',
      specialityId: treatmentRow.specialityId,
      typicalStayDays: '14',
      summary: '',
    };
    expect(toPayload('treatments', values, false)).toEqual({
      slug: 'bypass',
      name: 'Bypass',
      specialityId: treatmentRow.specialityId,
      typicalStayDays: 14,
      summary: null,
      active: true,
      translations: {},
    });
  });

  it('keeps the Arabic summary only on tables that have one', () => {
    const withArabic = (resource: MasterResource) => ({
      ...initialValues(resource),
      translations: { ar: { name: 'اسم', summary: 'ملخص' } },
    });
    expect(toPayload('treatments', withArabic('treatments'), false)['translations']).toEqual({
      ar: { name: 'اسم', summary: 'ملخص' },
    });
    expect(toPayload('cities', withArabic('cities'), false)['translations']).toEqual({
      ar: { name: 'اسم' },
    });
  });

  it('leaves the immutable code out when editing', () => {
    const values = { ...initialValues('countries'), code: 'IN', name: 'India' };
    expect(toPayload('countries', values, true)).not.toHaveProperty('code');
    expect(toPayload('countries', values, false)).toHaveProperty('code', 'IN');
  });

  it('produces bodies the contracts schemas accept', () => {
    const create = {
      ...initialValues('treatments'),
      slug: 'bypass',
      name: 'Bypass',
      specialityId: treatmentRow.specialityId,
      translations: { ar: { name: 'اسم', summary: '' } },
    };
    expect(
      MASTER_CREATE_SCHEMAS.treatments.safeParse(toPayload('treatments', create, false)).success,
    ).toBe(true);
    const edit = initialValues('treatments', treatmentRow);
    expect(
      MASTER_UPDATE_SCHEMAS.treatments.safeParse(toPayload('treatments', edit, true)).success,
    ).toBe(true);
  });

  it('fails the schema for what the admin left empty, so the form shows an error on that field', () => {
    const result = MASTER_CREATE_SCHEMAS.treatments.safeParse(
      toPayload('treatments', initialValues('treatments'), false),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['slug', 'name', 'specialityId']),
      );
    }
  });
});

describe('changedFields', () => {
  it('is empty when nothing changed, and holds only what did', () => {
    const unchanged = toPayload('treatments', initialValues('treatments', treatmentRow), true);
    expect(changedFields('treatments', treatmentRow, unchanged)).toEqual({});

    const renamed = toPayload(
      'treatments',
      { ...initialValues('treatments', treatmentRow), name: 'Renamed' },
      true,
    );
    expect(changedFields('treatments', treatmentRow, renamed)).toEqual({ name: 'Renamed' });
  });

  it('sends all translations when one changed, and an empty set when they were cleared', () => {
    const edited = {
      ...initialValues('treatments', treatmentRow),
      translations: { ar: { name: 'جديد', summary: '' } },
    };
    expect(
      changedFields('treatments', treatmentRow, toPayload('treatments', edited, true)),
    ).toEqual({
      translations: { ar: { name: 'جديد', summary: null } },
    });
    const cleared = {
      ...initialValues('treatments', treatmentRow),
      translations: { ar: { name: '', summary: '' } },
    };
    expect(
      changedFields('treatments', treatmentRow, toPayload('treatments', cleared, true)),
    ).toEqual({
      translations: {},
    });
  });
});
