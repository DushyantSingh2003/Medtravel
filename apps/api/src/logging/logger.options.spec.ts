import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS, loggerOptions, scrubUrl } from './logger.options.js';
import type { Env } from '../config/env.schema.js';

const env = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'production',
    PORT: 3001,
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: ['http://localhost:3000'],
    ...overrides,
  }) as Env;

describe('loggerOptions', () => {
  it('redacts credentials and patient identifiers', () => {
    for (const path of ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.otp']) {
      expect(REDACTED_PATHS).toContain(path);
    }
  });

  it('ships plain JSON in production', () => {
    expect(loggerOptions(env()).pinoHttp).not.toHaveProperty('transport');
  });

  it('pretty-prints in development', () => {
    expect(loggerOptions(env({ NODE_ENV: 'development' })).pinoHttp).toHaveProperty('transport');
  });
});

describe('scrubUrl', () => {
  it('hides invitation and link tokens in a request address', () => {
    expect(scrubUrl('/auth/invitations/abc123_-XYZ')).toBe('/auth/invitations/[redacted]');
    expect(scrubUrl('/x?token=secret&a=1')).toBe('/x?token=[redacted]&a=1');
    expect(scrubUrl('/masters/countries?q=in')).toBe('/masters/countries?q=in');
  });
});
