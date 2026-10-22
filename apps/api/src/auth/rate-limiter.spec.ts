import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows the limit, refuses the next hit, and starts over after the window', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i += 1) limiter.consume('login:1.2.3.4', 3, 60, 1_000);
    expect(() => limiter.consume('login:1.2.3.4', 3, 60, 2_000)).toThrow(/Too many attempts/);
    expect(() => limiter.consume('login:1.2.3.4', 3, 60, 61_001)).not.toThrow();
  });

  it('counts each key on its own', () => {
    const limiter = new RateLimiter();
    limiter.consume('a', 1, 60, 0);
    expect(() => limiter.consume('b', 1, 60, 0)).not.toThrow();
    expect(() => limiter.consume('a', 1, 60, 0)).toThrow();
  });

  it('says how long to wait', () => {
    const limiter = new RateLimiter();
    limiter.consume('a', 1, 60, 0);
    try {
      limiter.consume('a', 1, 60, 10_000);
    } catch (error) {
      expect(
        (error as { getResponse(): { retryAfterSeconds: number } }).getResponse().retryAfterSeconds,
      ).toBe(50);
    }
  });
});
