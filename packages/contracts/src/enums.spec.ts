import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const enumArrays = Object.entries(contracts).filter(
  (entry): entry is [string, readonly string[]] =>
    Array.isArray(entry[1]) && entry[1].every((value) => typeof value === 'string'),
);

describe('database enums', () => {
  it('are non-empty, unique and written in lower snake case', () => {
    expect(enumArrays.length).toBeGreaterThan(40);
    for (const [name, values] of enumArrays) {
      if (
        [
          'LOCALES',
          'RTL_LOCALES',
          'DISPLAY_CURRENCIES',
          'MASTER_RESOURCES',
          'PERMISSION_SUBJECTS',
        ].includes(name)
      )
        continue;
      expect(values.length, name).toBeGreaterThan(0);
      expect(new Set(values).size, `${name} has duplicates`).toBe(values.length);
      for (const value of values) expect(value, `${name}.${value}`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('parse their own values and reject anything else', () => {
    expect(contracts.paymentStatusSchema.parse('succeeded')).toBe('succeeded');
    expect(contracts.paymentStatusSchema.safeParse('paid').success).toBe(false);
    expect(contracts.documentVisibilitySchema.options).toEqual(['private', 'internal']);
  });
});
