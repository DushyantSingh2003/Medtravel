import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = loadEnv(valid as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits CORS_ORIGINS into a trimmed list', () => {
    const env = loadEnv({
      ...valid,
      CORS_ORIGINS: 'http://a.test, http://b.test ,',
    } as NodeJS.ProcessEnv);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('coerces PORT from its string form', () => {
    expect(loadEnv({ ...valid, PORT: '8080' } as NodeJS.ProcessEnv).PORT).toBe(8080);
  });

  it('fails loudly when a required variable is missing', () => {
    expect(() => loadEnv({ REDIS_URL: valid.REDIS_URL } as NodeJS.ProcessEnv)).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow(
      /DATABASE_URL/,
    );
  });

  it('runs a fresh checkout with development secrets, and refuses them in production', () => {
    expect(loadEnv(valid as NodeJS.ProcessEnv).EMAIL_TRANSPORT).toBe('capture');
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /AUTH_TOKEN_SECRET/,
    );
    const production = {
      ...valid,
      NODE_ENV: 'production',
      AUTH_TOKEN_SECRET: 'x'.repeat(48),
      AUTH_ENCRYPTION_KEY: 'ab'.repeat(32),
      EMAIL_TRANSPORT: 'smtp',
      TRUST_PROXY_HOPS: '1',
      S3_ACCESS_KEY: 'AKIAREAL',
      S3_SECRET_KEY: 'real-secret-key',
    };
    expect(loadEnv(production as NodeJS.ProcessEnv).NODE_ENV).toBe('production');
    expect(() =>
      loadEnv({ ...production, EMAIL_TRANSPORT: 'capture' } as NodeJS.ProcessEnv),
    ).toThrow(/EMAIL_TRANSPORT/);
    expect(() => loadEnv({ ...production, TRUST_PROXY_HOPS: '0' } as NodeJS.ProcessEnv)).toThrow(
      /TRUST_PROXY_HOPS/,
    );
    expect(() =>
      loadEnv({ ...production, S3_SECRET_KEY: 'medtravel-secret' } as NodeJS.ProcessEnv),
    ).toThrow(/S3_SECRET_KEY/);
  });

  it('rejects a malformed encryption key and a short token secret', () => {
    expect(() => loadEnv({ ...valid, AUTH_ENCRYPTION_KEY: 'abc' } as NodeJS.ProcessEnv)).toThrow(
      /AUTH_ENCRYPTION_KEY/,
    );
    expect(() => loadEnv({ ...valid, AUTH_TOKEN_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /AUTH_TOKEN_SECRET/,
    );
  });

  it('allows skipping 2FA only in development', () => {
    expect(
      loadEnv({ ...valid, NODE_ENV: 'development', AUTH_DEV_SKIP_2FA: 'true' } as NodeJS.ProcessEnv)
        .AUTH_DEV_SKIP_2FA,
    ).toBe(true);
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'test', AUTH_DEV_SKIP_2FA: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_DEV_SKIP_2FA/);
  });

  it('refuses relaxed rate limits in production', () => {
    expect(
      loadEnv({ ...valid, NODE_ENV: 'test', AUTH_RATE_LIMIT_MULTIPLIER: '50' } as NodeJS.ProcessEnv)
        .AUTH_RATE_LIMIT_MULTIPLIER,
    ).toBe(50);
    expect(() =>
      loadEnv({
        ...valid,
        NODE_ENV: 'production',
        AUTH_TOKEN_SECRET: 'x'.repeat(48),
        AUTH_ENCRYPTION_KEY: 'ab'.repeat(32),
        EMAIL_TRANSPORT: 'smtp',
        AUTH_RATE_LIMIT_MULTIPLIER: '50',
      } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_RATE_LIMIT_MULTIPLIER/);
  });
});
