import { describe, expect, it } from 'vitest';
import { doctorTags, hospitalTags, packageTags, tagKey } from './revalidation.js';

const TAG = /^[a-z]+(:[a-z0-9-]+)?$/;

describe('cache tags', () => {
  it('turn any slug into the lower-case form the website accepts', () => {
    expect(tagKey('Foo_Bar Baz')).toBe('foo-bar-baz');
    expect(tagKey('  --Apollo--  ')).toBe('apollo');
    expect(tagKey('###')).toBe('x');
  });
  it('are always valid for the website route', () => {
    for (const tag of [
      ...hospitalTags('Foo_Bar'),
      ...doctorTags('Dr. Rao (Delhi)'),
      ...packageTags('Apollo_Delhi'),
    ])
      expect(tag, tag).toMatch(TAG);
  });
});
