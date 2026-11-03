import { describe, expect, it } from 'vitest';
import { acceptRequestId, currentRequestId, runWithRequestId } from './request-id.js';

describe('request ids', () => {
  it('trusts a well-formed incoming id and replaces anything else', () => {
    expect(acceptRequestId('trace-abc12345')).toBe('trace-abc12345');
    for (const bad of [
      undefined,
      '',
      'short',
      'has spaces in it!!',
      'x'.repeat(200),
      '<script>alert(1)</script>',
    ])
      expect(acceptRequestId(bad)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is available to everything run under it, including async code, and only there', async () => {
    expect(currentRequestId()).toBeUndefined();
    const seen = await runWithRequestId('req-12345678', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return currentRequestId();
    });
    expect(seen).toBe('req-12345678');
    expect(currentRequestId()).toBeUndefined();
  });
});
