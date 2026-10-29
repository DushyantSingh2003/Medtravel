import { randomUUID } from 'node:crypto';
import { statusUpdateSchema, type StatusUpdate } from '@medtravel/contracts';
import { z } from 'zod';
import type {
  EmailProvider,
  SmsMessage,
  SmsProvider,
  WhatsAppProvider,
  WhatsAppTemplateMessage,
  Sent,
} from './types.js';

const devCallbackSchema = z.object({ updates: z.array(statusUpdateSchema).max(100) });

function readDevCallback(body: unknown): StatusUpdate[] {
  const parsed = devCallbackSchema.safeParse(body);
  return parsed.success ? parsed.data.updates : [];
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

/**
 * Development stand-in for the SMS provider: the message arrives in Mailpit as an email to `<number>@sms.dev.local`, so one
 * inbox shows everything the platform would send. Its delivery callbacks use our own format (`{ updates: [...] }`).
 */
export class DevSmsProvider implements SmsProvider {
  readonly name = 'dev';
  constructor(private readonly email: EmailProvider) {}

  async send(message: SmsMessage): Promise<Sent> {
    await this.email.send({
      to: `${message.to.replace(/\D/g, '')}@sms.dev.local`,
      subject: `[SMS] ${message.text.slice(0, 60)}`,
      text: message.text,
      html: `<p>${escapeHtml(message.text)}</p>`,
    });
    return { id: `dev-sms-${randomUUID()}` };
  }

  parseStatus(body: unknown): StatusUpdate[] {
    return readDevCallback(body);
  }
}

/** Development stand-in for WhatsApp: the template (or text) arrives in Mailpit as an email to `<number>@whatsapp.dev.local`. */
export class DevWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'dev';
  constructor(private readonly email: EmailProvider) {}

  private async deliver(to: string, kind: string, text: string, extra?: string): Promise<Sent> {
    await this.email.send({
      to: `${to.replace(/\D/g, '')}@whatsapp.dev.local`,
      subject: `[WhatsApp ${kind}] ${text.slice(0, 60)}`,
      text: extra ? `${text}\n\n${extra}` : text,
      html: `<p>${escapeHtml(text)}</p>${extra ? `<p><small>${escapeHtml(extra)}</small></p>` : ''}`,
    });
    return { id: `dev-wa-${randomUUID()}` };
  }

  sendTemplate(message: WhatsAppTemplateMessage): Promise<Sent> {
    return this.deliver(
      message.to,
      'template',
      message.text,
      `template ${message.template} (${message.language}): ${message.parameters.join(' | ')}`,
    );
  }

  sendText(message: SmsMessage): Promise<Sent> {
    return this.deliver(message.to, 'session', message.text);
  }

  parseStatus(body: unknown): StatusUpdate[] {
    return readDevCallback(body);
  }
}
