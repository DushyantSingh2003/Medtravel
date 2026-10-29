import { NOTIFICATION_EVENT_KEYS, NOTIFICATION_EVENTS } from '@medtravel/contracts';
import { describe, expect, it } from 'vitest';
import {
  fill,
  placeholdersOf,
  renderEmail,
  renderText,
  TEMPLATE_TEXTS,
  whatsappTemplate,
} from './render.js';

describe('the template registry', () => {
  it('covers every event of PRD section 10: 19 for patients, 7 internal, 3 for agents', () => {
    const count = (audience: string) =>
      NOTIFICATION_EVENT_KEYS.filter((key) => NOTIFICATION_EVENTS[key].audience === audience)
        .length;
    expect(count('patient')).toBe(19);
    expect(count('internal')).toBe(7);
    expect(count('agent')).toBe(3);
  });

  it('has an English and an Arabic text for every event, and uses only the variables the event declares', () => {
    for (const locale of ['en', 'ar'] as const)
      for (const key of NOTIFICATION_EVENT_KEYS) {
        const text = TEMPLATE_TEXTS[locale][key];
        expect(text, `${locale} ${key}`).toBeDefined();
        expect(text.title.trim(), `${locale} ${key} title`).not.toBe('');
        expect(text.body.trim(), `${locale} ${key} body`).not.toBe('');
        const declared = new Set<string>(NOTIFICATION_EVENTS[key].variables);
        for (const name of [...placeholdersOf(text.title), ...placeholdersOf(text.body)])
          expect(declared.has(name), `${locale} ${key} uses {${name}}`).toBe(true);
      }
  });

  it('uses every declared variable in the body of both languages, except where the text deliberately leaves one out', () => {
    for (const locale of ['en', 'ar'] as const)
      for (const key of NOTIFICATION_EVENT_KEYS) {
        const text = TEMPLATE_TEXTS[locale][key];
        const used = new Set([...placeholdersOf(text.title), ...placeholdersOf(text.body)]);
        for (const name of NOTIFICATION_EVENTS[key].variables)
          expect(used.has(name), `${locale} ${key} never shows {${name}}`).toBe(true);
      }
  });

  it('writes the Arabic texts in Arabic letters, apart from the placeholders and the brand', () => {
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const text = TEMPLATE_TEXTS.ar[key];
      const words = `${text.title} ${text.body}`.replace(/\{\w+\}/g, '').replace(/MedTravel/g, '');
      expect(words, key).toMatch(/\p{Script=Arabic}/u);
    }
  });

  it('sends security events on in-app and email, and urgent patient reminders also by SMS', () => {
    expect(NOTIFICATION_EVENTS.incident_logged.category).toBe('security');
    expect(NOTIFICATION_EVENTS.document_quarantined.category).toBe('security');
    expect(NOTIFICATION_EVENTS.pickup_2h.channels).toContain('sms');
    expect(NOTIFICATION_EVENTS.enquiry_received.channels[0]).toBe('whatsapp');
  });
});

describe('rendering', () => {
  it('fills placeholders, leaving nothing behind for a missing variable', () => {
    expect(fill('Hi {name}, {missing}.', { name: 'Asha' })).toBe('Hi Asha, .');
  });

  it("writes in the person's language, English when there is none for it", () => {
    const data = { name: 'Asha' };
    expect(renderText('test_event', 'ar', data)).toMatchObject({ locale: 'ar' });
    expect(renderText('test_event', 'ar-SA', data).body).toContain('Asha');
    expect(renderText('test_event', 'fr', data)).toMatchObject({
      locale: 'en',
      title: 'Test notification',
    });
    expect(renderText('test_event', null, data).locale).toBe('en');
  });

  it('renders an email with the right direction and language', async () => {
    const mail = await renderEmail('test_event', 'ar', { name: 'Asha' });
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('lang="ar"');
    expect(mail.subject).toBe('إشعار تجريبي');
    expect(mail.text).toContain('Asha');
    expect((await renderEmail('test_event', 'en', { name: 'Asha' })).html).toContain('dir="ltr"');
  });

  it('orders the WhatsApp template parameters as the event declares its variables', () => {
    const template = whatsappTemplate('quote_sent', 'ar', {
      total: 'USD 5,000',
      caseNumber: 'CASE-2026-000001',
      patientName: 'Asha',
      quoteNumber: 'Q-000007',
    });
    expect(template).toEqual({
      name: 'mt_quote_sent',
      language: 'ar',
      parameters: ['Asha', 'CASE-2026-000001', 'Q-000007', 'USD 5,000'],
    });
  });
});
