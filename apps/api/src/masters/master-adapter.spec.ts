import { describe, expect, it } from 'vitest';
import { MASTER_DEFINITIONS, MASTER_RESOURCES } from '@medtravel/contracts';
import { MASTER_ADAPTERS, MASTER_ENTITY_TYPES } from './adapters/index.js';
import { orderByOf, translationMap, translationRows } from './master-adapter.js';

describe('master adapters', () => {
  it('exist for every resource, with the definition from the contracts', () => {
    for (const resource of MASTER_RESOURCES) {
      expect(MASTER_ADAPTERS[resource].definition, resource).toBe(MASTER_DEFINITIONS[resource]);
      expect(MASTER_ENTITY_TYPES[resource], resource).toBeTruthy();
    }
  });

  it('refuse to delete the tables the contracts say can only be deactivated', () => {
    for (const resource of MASTER_RESOURCES.filter((r) => !MASTER_DEFINITIONS[r].softDelete)) {
      expect(() => MASTER_ADAPTERS[resource].setDeleted({} as never, 'x', true), resource).toThrow(
        /deactivated/,
      );
    }
  });
});

describe('orderByOf', () => {
  const allowed = ['name', 'createdAt'] as const;

  it('defaults to name ascending and always ends with the key, so pages never overlap', () => {
    expect(orderByOf(undefined, allowed, 'id')).toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  it('reads a leading minus as descending', () => {
    expect(orderByOf('-createdAt', allowed, 'id')).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('refuses a field that is not allowed', () => {
    expect(() => orderByOf('passwordHash', allowed, 'id')).toThrow(/Cannot sort by/);
  });
});

describe('translations', () => {
  it('turn rows into a map and back', () => {
    const rows = translationRows({ ar: { name: 'اسم', summary: 'ملخص' } });
    expect(rows).toEqual([{ locale: 'ar', name: 'اسم', summary: 'ملخص' }]);
    expect(translationMap(rows)).toEqual({ ar: { name: 'اسم', summary: 'ملخص' } });
  });

  it('omit the summary on tables that have none', () => {
    expect(translationMap([{ locale: 'ar', name: 'اسم' }])).toEqual({ ar: { name: 'اسم' } });
  });

  it('write nothing for no translations', () => {
    expect(translationRows(undefined)).toEqual([]);
  });
});
