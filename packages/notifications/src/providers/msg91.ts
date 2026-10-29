import { z } from 'zod';
import type { StatusUpdate } from '@medtravel/contracts';
import { readJson, type Fetch } from './http.js';
import type { Sent, SmsMessage, SmsProvider } from './types.js';

export interface Msg91Config {
  authKey: string;
  /** The DLT-approved flow template; it must contain one variable named `message`. */
  templateId: string;
  baseUrl?: string;
  fetch?: Fetch;
}

const sentSchema = z.object({ type: z.string(), message: z.string().min(1) });
const callbackSchema = z.object({
  request_id: z.string().min(1),
  status: z.union([z.string(), z.number()]),
  desc: z.string().optional(),
});

/** SMS through MSG91's flow API (India's DLT rules require a pre-approved template; the text goes into its `message` variable). */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';
  constructor(private readonly config: Msg91Config) {}

  async send(message: SmsMessage): Promise<Sent> {
    const base = this.config.baseUrl ?? 'https://control.msg91.com';
    const response = await (this.config.fetch ?? fetch)(`${base}/api/v5/flow/`, {
      method: 'POST',
      headers: { authkey: this.config.authKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: this.config.templateId,
        short_url: '0',
        recipients: [{ mobiles: message.to.replace(/\D/g, ''), message: message.text }],
      }),
    });
    const parsed = sentSchema.parse(await readJson(response, 'MSG91'));
    if (parsed.type !== 'success') throw new Error('MSG91 did not accept the message');
    // MSG91 returns the request id in `message`.
    return { id: parsed.message };
  }

  parseStatus(body: unknown): StatusUpdate[] {
    const parsed = callbackSchema.safeParse(body);
    if (!parsed.success) return [];
    const code = String(parsed.data.status);
    const status: StatusUpdate['status'] | null =
      code === '1' || code.toLowerCase() === 'delivered'
        ? 'delivered'
        : code === '2' || code.toLowerCase() === 'failed'
          ? 'failed'
          : null;
    if (!status) return [];
    return [
      {
        providerMessageId: parsed.data.request_id,
        eventId: `${parsed.data.request_id}:${status}`,
        status,
        ...(status === 'failed' && parsed.data.desc
          ? { error: parsed.data.desc.slice(0, 300) }
          : {}),
      },
    ];
  }
}
