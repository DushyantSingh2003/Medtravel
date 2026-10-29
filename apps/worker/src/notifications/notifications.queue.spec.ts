import { describe, expect, it } from 'vitest';
import { notificationJobSchema } from './notifications.queue.js';

describe('notificationJobSchema', () => {
  it('defaults locale to English and data to an empty object', () => {
    expect(
      notificationJobSchema.parse({ channel: 'email', to: 'a@b.test', template: 'welcome' }),
    ).toEqual({ channel: 'email', to: 'a@b.test', template: 'welcome', locale: 'en', data: {} });
  });

  it('rejects an unknown channel', () => {
    const result = notificationJobSchema.safeParse({
      channel: 'pigeon',
      to: 'a@b.test',
      template: 'welcome',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty recipient', () => {
    expect(
      notificationJobSchema.safeParse({ channel: 'sms', to: '', template: 'welcome' }).success,
    ).toBe(false);
  });
});
