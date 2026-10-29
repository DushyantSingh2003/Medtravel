import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderEmail } from './render.js';
import { SmtpEmailProvider } from './providers/index.js';
import { DevSmsProvider, DevWhatsAppProvider } from './providers/index.js';
import { FakeSmtpServer } from './testing/index.js';

const server = new FakeSmtpServer();
let provider: SmtpEmailProvider;

beforeAll(async () => {
  const { port } = await server.start();
  provider = new SmtpEmailProvider({
    host: '127.0.0.1',
    port,
    from: 'MedTravel <noreply@medtravel.local>',
  });
});
afterAll(() => server.close());
beforeEach(() => server.clear());

describe('email over SMTP', () => {
  it('sends a rendered Arabic message with its subject, direction and the right addresses', async () => {
    const mail = await renderEmail('test_event', 'ar', { name: 'Asha' });
    const sent = await provider.send({ to: 'asha@example.test', ...mail });
    expect(sent.id).toBeTruthy();
    expect(server.messages).toHaveLength(1);
    const received = server.messages[0];
    expect(received?.to).toEqual(['asha@example.test']);
    expect(received?.from).toBe('noreply@medtravel.local');
    expect(received?.subject).toBe('إشعار تجريبي');
    expect(received?.text).toContain('dir="rtl"');
    expect(received?.text).toContain('Asha');
  });

  it('rejects when nothing is listening, so the delivery is retried', async () => {
    const down = new SmtpEmailProvider({ host: '127.0.0.1', port: 1, from: 'a@b.test' });
    await expect(
      down.send({ to: 'asha@example.test', subject: 's', text: 't', html: '<p>t</p>' }),
    ).rejects.toThrow();
  });

  it('carries development SMS and WhatsApp messages as email to one inbox', async () => {
    await new DevSmsProvider(provider).send({ to: '+91 98000 00001', text: 'Your code is 123456' });
    await new DevWhatsAppProvider(provider).sendText({ to: '+919800000001', text: 'Hello Asha' });
    expect(server.messages.map((m) => m.to[0])).toEqual([
      '919800000001@sms.dev.local',
      '919800000001@whatsapp.dev.local',
    ]);
    expect(server.messages[0]?.subject).toContain('[SMS]');
  });
});
