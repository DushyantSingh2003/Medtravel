import { runWithRequestId } from '@medtravel/observability';
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

  it('hides the verify token and challenge of the WhatsApp subscription check', () => {
    expect(
      scrubUrl(
        '/webhooks/notifications/whatsapp?hub.mode=subscribe&hub.verify_token=s3cret-value&hub.challenge=12345',
      ),
    ).toBe(
      '/webhooks/notifications/whatsapp?hub.mode=subscribe&hub.verify_token=[redacted]&hub.challenge=[redacted]',
    );
  });
});

describe('what a request log line carries', () => {
  const options = () => {
    const params = loggerOptions({ NODE_ENV: 'test', LOG_LEVEL: 'info' } as Env);
    const http = params.pinoHttp as {
      serializers: { req: (request: Record<string, unknown>) => Record<string, unknown> };
      mixin: () => Record<string, unknown>;
    };
    return http;
  };

  it('keeps the names of the query parameters and drops their values', () => {
    const serialized = options().serializers.req({
      method: 'GET',
      url: '/auth/magic?token=abc&email=asha@example.com',
      query: { token: 'abc', email: 'asha@example.com' },
      headers: {},
    });
    expect(serialized['query']).toEqual({ token: '[redacted]', email: '[redacted]' });
    expect(JSON.stringify(serialized)).not.toMatch(/abc|asha/);
  });

  it('adds the request ID to every line written while the request runs', () => {
    expect(options().mixin()).toEqual({ requestId: undefined });
    expect(runWithRequestId('trace-00000001', () => options().mixin())).toEqual({
      requestId: 'trace-00000001',
    });
  });
});
