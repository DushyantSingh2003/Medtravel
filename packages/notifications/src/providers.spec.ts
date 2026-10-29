import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProviders,
  DevSmsProvider,
  DevWhatsAppProvider,
  MetaWhatsAppProvider,
  Msg91SmsProvider,
  PermanentDeliveryError,
  TwilioSmsProvider,
  type EmailMessage,
  type EmailProvider,
} from './providers/index.js';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let server: Server;
let base = '';
let seen: Seen[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      seen.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen = [];
  reply = { status: 200, body: {} };
});

describe('Twilio SMS', () => {
  const twilio = () =>
    new TwilioSmsProvider({
      accountSid: 'AC1',
      authToken: 'secret',
      from: '+15550001',
      baseUrl: base,
    });

  it('posts the message with basic auth and returns the sid', async () => {
    reply = { status: 201, body: { sid: 'SM123' } };
    expect(await twilio().send({ to: '+919800000001', text: 'Hello' })).toEqual({ id: 'SM123' });
    expect(seen[0]?.url).toBe('/2010-04-01/Accounts/AC1/Messages.json');
    expect(seen[0]?.headers['authorization']).toBe(
      `Basic ${Buffer.from('AC1:secret').toString('base64')}`,
    );
    const form = new URLSearchParams(seen[0]?.body);
    expect(form.get('To')).toBe('+919800000001');
    expect(form.get('Body')).toBe('Hello');
  });

  it('treats a 4xx as final and a 5xx or 429 as worth retrying, without echoing the number or text', async () => {
    reply = { status: 400, body: { message: 'bad number +919800000001' } };
    const refused = await twilio()
      .send({ to: '+919800000001', text: 'x' })
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PermanentDeliveryError);
    expect((refused as Error).message).not.toContain('9198');
    for (const status of [429, 503]) {
      reply = { status, body: {} };
      const error = await twilio()
        .send({ to: '+1', text: 'x' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(PermanentDeliveryError);
    }
  });

  it('reads Twilio status callbacks, with undelivered meaning failed', () => {
    const provider = twilio();
    expect(provider.parseStatus({ MessageSid: 'SM1', MessageStatus: 'delivered' })).toEqual([
      { providerMessageId: 'SM1', eventId: 'SM1:delivered', status: 'delivered' },
    ]);
    expect(
      provider.parseStatus({
        MessageSid: 'SM1',
        MessageStatus: 'undelivered',
        ErrorMessage: 'Unreachable',
      }),
    ).toMatchObject([{ status: 'failed', error: 'Unreachable' }]);
    expect(provider.parseStatus({ MessageSid: 'SM1', MessageStatus: 'queued' })).toEqual([]);
    expect(provider.parseStatus('nonsense')).toEqual([]);
  });
});

describe('MSG91 SMS', () => {
  const msg91 = () => new Msg91SmsProvider({ authKey: 'key', templateId: 'tpl1', baseUrl: base });

  it('sends through the flow API with the text in the template variable', async () => {
    reply = { status: 200, body: { type: 'success', message: 'req-9' } };
    expect(await msg91().send({ to: '+91 98000 00001', text: 'Hello' })).toEqual({ id: 'req-9' });
    expect(seen[0]?.headers['authkey']).toBe('key');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      template_id: 'tpl1',
      short_url: '0',
      recipients: [{ mobiles: '919800000001', message: 'Hello' }],
    });
  });

  it('fails when MSG91 does not accept the message, and reads its callbacks', async () => {
    reply = { status: 200, body: { type: 'error', message: 'invalid template' } };
    await expect(msg91().send({ to: '+91 98000 00001', text: 'x' })).rejects.toThrow();
    expect(msg91().parseStatus({ request_id: 'r1', status: 1 })).toMatchObject([
      { status: 'delivered' },
    ]);
    expect(msg91().parseStatus({ request_id: 'r1', status: 2, desc: 'DND' })).toMatchObject([
      { status: 'failed', error: 'DND' },
    ]);
  });
});

describe('WhatsApp through the Meta Cloud API', () => {
  const meta = () =>
    new MetaWhatsAppProvider({ phoneNumberId: '555', accessToken: 'tok', baseUrl: base });

  it('sends an approved template with its parameters in order', async () => {
    reply = { status: 200, body: { messages: [{ id: 'wamid.1' }] } };
    const sent = await meta().sendTemplate({
      to: '+91 98000 00001',
      template: 'mt_quote_sent',
      language: 'ar',
      parameters: ['Asha', 'CASE-1'],
      text: 'unused',
    });
    expect(sent).toEqual({ id: 'wamid.1' });
    expect(seen[0]?.url).toBe('/v21.0/555/messages');
    expect(seen[0]?.headers['authorization']).toBe('Bearer tok');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      messaging_product: 'whatsapp',
      to: '919800000001',
      type: 'template',
      template: {
        name: 'mt_quote_sent',
        language: { code: 'ar' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Asha' },
              { type: 'text', text: 'CASE-1' },
            ],
          },
        ],
      },
    });
  });

  it('sends free text, and treats a rejection as final', async () => {
    reply = { status: 200, body: { messages: [{ id: 'wamid.2' }] } };
    await meta().sendText({ to: '+919800000001', text: 'Hi' });
    expect(JSON.parse(seen[0]?.body ?? '{}')).toMatchObject({ type: 'text', text: { body: 'Hi' } });
    reply = { status: 400, body: { error: { message: 'template not approved' } } };
    await expect(meta().sendText({ to: '+919800000001', text: 'Hi' })).rejects.toBeInstanceOf(
      PermanentDeliveryError,
    );
  });

  it('reads status callbacks, skipping kinds it does not know', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'wamid.1', status: 'delivered', timestamp: '1788000000' },
                  { id: 'wamid.1', status: 'read' },
                  { id: 'wamid.2', status: 'failed', errors: [{ title: 'Undeliverable' }] },
                  { id: 'wamid.3', status: 'deleted' },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(meta().parseStatus(body)).toEqual([
      {
        providerMessageId: 'wamid.1',
        eventId: 'wamid.1:delivered',
        status: 'delivered',
        at: '2026-08-29T10:40:00.000Z',
      },
      { providerMessageId: 'wamid.1', eventId: 'wamid.1:read', status: 'read' },
      {
        providerMessageId: 'wamid.2',
        eventId: 'wamid.2:failed',
        status: 'failed',
        error: 'Undeliverable',
      },
    ]);
    expect(meta().parseStatus({ entry: [] })).toEqual([]);
  });
});

describe('development adapters', () => {
  class Inbox implements EmailProvider {
    readonly name = 'inbox';
    readonly mails: EmailMessage[] = [];
    async send(message: EmailMessage) {
      this.mails.push(message);
      return { id: 'm' };
    }
  }

  it('deliver SMS and WhatsApp to the email inbox, one address per number', async () => {
    const inbox = new Inbox();
    const sms = await new DevSmsProvider(inbox).send({ to: '+91 98000 00001', text: 'Your code' });
    const wa = await new DevWhatsAppProvider(inbox).sendTemplate({
      to: '+919800000001',
      template: 'mt_test_event',
      language: 'en',
      parameters: ['Asha'],
      text: 'Hello Asha',
    });
    expect(sms.id).toMatch(/^dev-sms-/);
    expect(wa.id).toMatch(/^dev-wa-/);
    expect(inbox.mails.map((m) => m.to)).toEqual([
      '919800000001@sms.dev.local',
      '919800000001@whatsapp.dev.local',
    ]);
    expect(inbox.mails[1]?.text).toContain('mt_test_event');
  });

  it('read the development callback format', () => {
    const provider = new DevSmsProvider(new Inbox());
    const update = { providerMessageId: 'dev-sms-1', eventId: 'e1', status: 'delivered' as const };
    expect(provider.parseStatus({ updates: [update] })).toEqual([update]);
    expect(provider.parseStatus({ updates: [{ status: 'bogus' }] })).toEqual([]);
  });
});

describe('createProviders', () => {
  const email = { host: 'localhost', port: 1025, from: 'MedTravel <noreply@medtravel.local>' };

  it('chooses the adapters from configuration', () => {
    const dev = createProviders({ email, sms: { provider: 'dev' }, whatsapp: { provider: 'dev' } });
    expect([dev.sms.name, dev.whatsapp.name, dev.email.name]).toEqual(['dev', 'dev', 'smtp']);
    const real = createProviders({
      email,
      sms: { provider: 'twilio', twilio: { accountSid: 'a', authToken: 'b', from: 'c' } },
      whatsapp: { provider: 'meta', meta: { phoneNumberId: '1', accessToken: 't' } },
    });
    expect([real.sms.name, real.whatsapp.name]).toEqual(['twilio', 'meta']);
  });

  it('refuses a real provider with no settings, rather than falling back to the development one', () => {
    expect(() =>
      createProviders({ email, sms: { provider: 'twilio' }, whatsapp: { provider: 'dev' } }),
    ).toThrow();
    expect(() =>
      createProviders({ email, sms: { provider: 'msg91' }, whatsapp: { provider: 'dev' } }),
    ).toThrow();
    expect(() =>
      createProviders({ email, sms: { provider: 'dev' }, whatsapp: { provider: 'meta' } }),
    ).toThrow();
  });
});
