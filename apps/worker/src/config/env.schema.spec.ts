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
    } as NodeJS.ProcessEnv;
    expect(loadEnv(production).SMS_PROVIDER).toBe('twilio');
    expect(() => loadEnv({ ...production, SMS_PROVIDER: 'dev' })).toThrow(/SMS_PROVIDER/);
    expect(() => loadEnv({ ...production, WHATSAPP_PROVIDER: 'dev' })).toThrow(/WHATSAPP_PROVIDER/);
    expect(() => loadEnv({ ...production, TWILIO_FROM: '' })).toThrow(/SMS_PROVIDER/);
  });
});
