import { z } from 'zod';
import type { StatusUpdate } from '@medtravel/contracts';
import { readJson, type Fetch } from './http.js';
import type { Sent, SmsMessage, SmsProvider } from './types.js';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  /** Where Twilio reports delivery (our webhook); optional. */
  statusCallback?: string;
  baseUrl?: string;
  fetch?: Fetch;
}

const sentSchema = z.object({ sid: z.string().min(1) });
const callbackSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.string().min(1),
  ErrorMessage: z.string().optional(),
});

const STATUS: Record<string, StatusUpdate['status']> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  undelivered: 'failed',
};

/** SMS through Twilio's Messages API. */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  constructor(private readonly config: TwilioConfig) {}

  async send(message: SmsMessage): Promise<Sent> {
    const base = this.config.baseUrl ?? 'https://api.twilio.com';
    const body = new URLSearchParams({
      To: message.to,
      From: this.config.from,
      Body: message.text,
      ...(this.config.statusCallback ? { StatusCallback: this.config.statusCallback } : {}),
    });
    const response = await (this.config.fetch ?? fetch)(
      `${base}/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    return { id: sentSchema.parse(await readJson(response, 'Twilio')).sid };
  }

  parseStatus(body: unknown): StatusUpdate[] {
    const parsed = callbackSchema.safeParse(body);
    if (!parsed.success) return [];
    const status = STATUS[parsed.data.MessageStatus.toLowerCase()];
    if (!status) return [];
    return [
      {
        providerMessageId: parsed.data.MessageSid,
        eventId: `${parsed.data.MessageSid}:${parsed.data.MessageStatus}`,
        status,
        ...(parsed.data.ErrorMessage ? { error: parsed.data.ErrorMessage.slice(0, 300) } : {}),
      },
    ];
  }
}
