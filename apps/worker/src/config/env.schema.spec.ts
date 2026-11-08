import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
} as NodeJS.ProcessEnv;

describe('worker env', () => {
  it('defaults concurrency to 5', () => {
    expect(loadEnv(valid).WORKER_CONCURRENCY).toBe(5);
  });

  it('rejects a missing Redis URL', () => {
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL } as NodeJS.ProcessEnv)).toThrow(
      /REDIS_URL/,
    );
  });

  it('uses the development SMS and WhatsApp stand-ins by default, and refuses them in production', () => {
    const env = loadEnv(valid);
    expect([env.SMS_PROVIDER, env.WHATSAPP_PROVIDER]).toEqual(['dev', 'dev']);
    const production = {
      ...valid,
      NODE_ENV: 'production',
      S3_ACCESS_KEY: 'AKIAREAL',
      S3_SECRET_KEY: 'real-secret-key',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM: '+15550001',
      WHATSAPP_PROVIDER: 'meta',
      WHATSAPP_PHONE_NUMBER_ID: '555',
      WHATSAPP_ACCESS_TOKEN: 'tok',
      NOTIFICATION_WEBHOOK_SECRET: 'a-real-webhook-secret',
      FX_PROVIDER: 'frankfurter',
      WEB_REVALIDATE_URL: 'https://site.example/api/revalidate',
      WEB_REVALIDATE_SECRET: 'a-real-revalidate-secret',
    } as NodeJS.ProcessEnv;
    expect(loadEnv(production).SMS_PROVIDER).toBe('twilio');
    expect(() => loadEnv({ ...production, SMS_PROVIDER: 'dev' })).toThrow(/SMS_PROVIDER/);
    expect(() => loadEnv({ ...production, WHATSAPP_PROVIDER: 'dev' })).toThrow(/WHATSAPP_PROVIDER/);
    expect(() => loadEnv({ ...production, TWILIO_FROM: '' })).toThrow(/SMS_PROVIDER/);
  });

  it('uses the fixed development exchange rates by default, and refuses them in production', () => {
    expect(loadEnv(valid).FX_PROVIDER).toBe('static');
    const production = {
      ...valid,
      NODE_ENV: 'production',
      S3_ACCESS_KEY: 'AKIAREAL',
      S3_SECRET_KEY: 'real-secret-key',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM: '+15550001',
      WHATSAPP_PROVIDER: 'meta',
      WHATSAPP_PHONE_NUMBER_ID: '555',
      WHATSAPP_ACCESS_TOKEN: 'tok',
      NOTIFICATION_WEBHOOK_SECRET: 'a-real-webhook-secret',
      WEB_REVALIDATE_URL: 'https://site.example/api/revalidate',
      WEB_REVALIDATE_SECRET: 'a-real-revalidate-secret',
    } as NodeJS.ProcessEnv;
    expect(() => loadEnv(production)).toThrow(/FX_PROVIDER/);
    expect(() => loadEnv({ ...production, FX_PROVIDER: 'openexchangerates' })).toThrow(
      /OPEN_EXCHANGE_RATES_APP_ID/,
    );
    expect(
      loadEnv({
        ...production,
        FX_PROVIDER: 'openexchangerates',
        OPEN_EXCHANGE_RATES_APP_ID: 'key',
      }).FX_PROVIDER,
    ).toBe('openexchangerates');
  });

  it('wants the website refresh address and secret together, and in production', () => {
    expect(loadEnv(valid).WEB_REVALIDATE_URL).toBeUndefined();
    expect(() => loadEnv({ ...valid, WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate' })).toThrow(
      /set together/,
    );
    expect(() => loadEnv({ ...valid, WEB_REVALIDATE_SECRET: 'a-long-enough-secret' })).toThrow(/set together/);
    expect(
      loadEnv({
        ...valid,
        WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
        WEB_REVALIDATE_SECRET: 'a-long-enough-secret',
      }).WEB_REVALIDATE_URL,
    ).toBe('http://localhost:3000/api/revalidate');
  });
});
