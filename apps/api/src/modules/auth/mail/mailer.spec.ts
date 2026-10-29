import type { Providers } from '@medtravel/notifications';
import { describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../../auth/rate-limiter.js';
import type { Env } from '../../../config/env.schema.js';
import { Mailer } from './mailer.js';

function mailer() {
  const sent: { to: string; text: string }[] = [];
  const providers = {
    sms: {
      name: 'test',
      send: vi.fn(async (message: { to: string; text: string }) => {
        sent.push(message);
        return { id: 'x' };
      }),
      parseStatus: () => [],
    },
  } as unknown as Providers;
  const env = {
    EMAIL_TRANSPORT: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 1,
    AUTH_RATE_LIMIT_MULTIPLIER: 1,
  } as Env;
  return { mailer: new Mailer(env, providers, new RateLimiter(env)), sent };
}

const sms = (to: string) => ({
  to,
  subject: '',
  text: 'Your code is 123456',
  template: 'login_code' as const,
  channel: 'sms' as const,
});

describe('sending a sign-in code by SMS', () => {
  it('goes straight to the SMS provider', async () => {
    const { mailer: m, sent } = mailer();
    await m.send(sms('+919800000001'));
    expect(sent).toEqual([{ to: '+919800000001', text: 'Your code is 123456' }]);
  });

  it('stops after five texts to one number in an hour, however the number is written', async () => {
    const { mailer: m, sent } = mailer();
    for (const written of [
      '+919800000002',
      '+91 98000 00002',
      '+91-98000-00002',
      '+919800000002',
      '+91 98000 00002',
    ])
      await m.send(sms(written));
    await expect(m.send(sms('+919800000002'))).rejects.toMatchObject({ status: 429 });
    expect(sent).toHaveLength(5);
    // Another number is unaffected.
    await m.send(sms('+919800000003'));
    expect(sent).toHaveLength(6);
  });
});
