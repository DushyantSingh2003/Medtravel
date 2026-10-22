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

  it('keeps the stub sign-in off unless it is exactly "true"', () => {
    expect(loadEnv(valid as NodeJS.ProcessEnv).ENABLE_STUB_AUTH).toBe(false);
    expect(loadEnv({ ...valid, ENABLE_STUB_AUTH: '1' } as NodeJS.ProcessEnv).ENABLE_STUB_AUTH).toBe(
      false,
    );
    expect(
      loadEnv({ ...valid, ENABLE_STUB_AUTH: 'true' } as NodeJS.ProcessEnv).ENABLE_STUB_AUTH,
    ).toBe(true);
  });

  it('refuses to boot with the stub sign-in in production', () => {
    expect(() =>
      loadEnv({ ...valid, NODE_ENV: 'production', ENABLE_STUB_AUTH: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/stub sign-in/);
  });
});
