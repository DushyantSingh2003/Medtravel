import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_LOCALE,
  isRtlLocale,
  localeSchema,
  paginatedSchema,
  paginationQuerySchema,
} from './primitives.js';

describe('locales', () => {
  it('accepts the shipped locales and rejects others', () => {
    expect(localeSchema.parse('en')).toBe('en');
    expect(localeSchema.parse('ar')).toBe('ar');
    expect(localeSchema.safeParse('de').success).toBe(false);
  });

  it('marks Arabic as right-to-left and English as not', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale(DEFAULT_LOCALE)).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('defaults to the first page of 20', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces query strings to numbers', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects a page size above the cap', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});

describe('paginatedSchema', () => {
  it('wraps the item schema', () => {
    const schema = paginatedSchema(z.object({ id: z.string() }));
    const parsed = schema.parse({
      items: [{ id: 'a' }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(parsed.items).toHaveLength(1);
  });
});
