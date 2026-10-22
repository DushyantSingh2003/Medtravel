import { describe, expect, it } from 'vitest';
import ar from './messages/ar.json' with { type: 'json' };
import en from './messages/en.json' with { type: 'json' };

type Tree = { [key: string]: string | Tree };

/** Flattens nested messages to `a.b.c -> text`. */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...out, [path]: value }
      : { ...out, ...flatten(value, path) };
  }, {});
}

const en_ = flatten(en as Tree);
const ar_ = flatten(ar as Tree);

/** `{name}` and `{count, plural, ...}` argument names used by a message. */
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)(?:,|\})/g)]
    .map((m) => m[1] ?? '')
    .filter((name) => name && !['zero', 'one', 'two', 'few', 'many', 'other'].includes(name))
    .sort();

describe('message catalogues', () => {
  it('have exactly the same keys in English and Arabic', () => {
    expect(Object.keys(ar_).sort()).toEqual(Object.keys(en_).sort());
  });

  it('have no empty strings', () => {
    for (const [key, text] of [...Object.entries(en_), ...Object.entries(ar_)]) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(en_)) {
      expect(placeholders(ar_[key] ?? ''), key).toEqual(placeholders(en_[key] ?? ''));
    }
  });

  it('give every Arabic plural message all six Arabic plural categories', () => {
    for (const [key, text] of Object.entries(ar_)) {
      if (!text.includes('plural')) continue;
      for (const category of ['zero', 'one', 'two', 'few', 'many', 'other']) {
        expect(text, `${key} (${category})`).toContain(`${category} {`);
      }
    }
  });

  it('write Arabic text in Arabic, not by copying the English', () => {
    const identicalOk = /^(CASE-|{count}|{name}|\d)/; // ids and bare placeholders
    const untranslated = Object.keys(en_).filter(
      (key) => ar_[key] === en_[key] && !identicalOk.test(en_[key] ?? ''),
    );
    expect(untranslated).toEqual([]);
  });

  it('keeps the brand name in a single script', () => {
    expect(ar_['common.appName']).toMatch(/^[؀-ۿ\s]+$/);
  });

  it('has all twelve stages and the three exit stages', () => {
    for (const stage of [
      'enquiry',
      'qualification',
      'medical_review',
      'hospital_opinions',
      'quote_decision',
      'booking_deposit',
      'visa',
      'travel_planning',
      'arrival',
      'treatment',
      'discharge_return',
      'follow_up',
      'lost',
      'on_hold',
      'cancelled',
    ]) {
      expect(en_[`stages.${stage}`], stage).toBeTruthy();
      expect(ar_[`stages.${stage}`], stage).toBeTruthy();
    }
  });
});
