import { describe, expect, it } from 'vitest';
import { getTranslated } from './translated.js';

const treatment = { name: 'Knee replacement', summary: 'A joint operation', price: 5 };
const rows = [
  { locale: 'ar', name: 'استبدال الركبة', summary: '' },
  { locale: 'hi', name: 'घुटना', summary: 'x' },
];

describe('getTranslated', () => {
  it('returns the English text for English, whatever translations exist', () => {
    expect(getTranslated(treatment, rows, 'en', ['name', 'summary'])).toEqual({
      name: 'Knee replacement',
      summary: 'A joint operation',
    });
  });

  it('returns the translation for a field that has one, and English for a blank or missing one', () => {
    expect(getTranslated(treatment, rows, 'ar', ['name', 'summary'])).toEqual({
      name: 'استبدال الركبة',
      summary: 'A joint operation',
    });
  });

  it('falls back to English when there is no row for the language, or no rows at all', () => {
    expect(getTranslated(treatment, [{ locale: 'hi', name: 'x' }], 'ar', ['name'])).toEqual({
      name: 'Knee replacement',
    });
    expect(getTranslated(treatment, null, 'ar', ['name'])).toEqual({ name: 'Knee replacement' });
    expect(getTranslated(treatment, undefined, 'ar', ['name'])).toEqual({
      name: 'Knee replacement',
    });
    expect(getTranslated(treatment, [{ locale: 'ar', name: '   ' }], 'ar', ['name'])).toEqual({
      name: 'Knee replacement',
    });
  });

  it('returns only the fields asked for', () => {
    expect(Object.keys(getTranslated(treatment, rows, 'ar', ['name']))).toEqual(['name']);
  });
});
