import { z } from 'zod';
import type { StatusUpdate } from '@medtravel/contracts';
import { readJson, type Fetch } from './http.js';
import type { Sent, SmsMessage, WhatsAppProvider, WhatsAppTemplateMessage } from './types.js';

export interface MetaWhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
  baseUrl?: string;
  fetch?: Fetch;
}

const sentSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });
const callbackSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            statuses: z
              .array(
                z.object({
                  id: z.string().min(1),
                  status: z.string(),
                  timestamp: z.string().optional(),
                  errors: z.array(z.object({ title: z.string().optional() })).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

/**
 * WhatsApp Business through the Meta Cloud API. Every BSP (Gupshup, Interakt, WATI) offers this API shape or a thin
 * wrapper of it, so switching BSP is a change of base URL and token, not of code.
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta';
  constructor(private readonly config: MetaWhatsAppConfig) {}

  private async post(payload: Record<string, unknown>): Promise<Sent> {
    const base = this.config.baseUrl ?? 'https://graph.facebook.com';
    const version = this.config.apiVersion ?? 'v21.0';
    const response = await (this.config.fetch ?? fetch)(
      `${base}/${version}/${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      },
    );
    const parsed = sentSchema.parse(await readJson(response, 'WhatsApp'));
    return { id: parsed.messages[0]?.id as string };
  }

  sendTemplate(message: WhatsAppTemplateMessage): Promise<Sent> {
    return this.post({
      to: message.to.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: message.template,
        language: { code: message.language },
        components: [
          {
            type: 'body',
            parameters: message.parameters.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  sendText(message: SmsMessage): Promise<Sent> {
    return this.post({
      to: message.to.replace(/\D/g, ''),
      type: 'text',
      text: { body: message.text },
    });
  }

  parseStatus(body: unknown): StatusUpdate[] {
    const parsed = callbackSchema.safeParse(body);
    if (!parsed.success) return [];
    const updates: StatusUpdate[] = [];
    for (const entry of parsed.data.entry)
      for (const change of entry.changes)
        for (const item of change.value.statuses ?? []) {
          if (!['sent', 'delivered', 'read', 'failed'].includes(item.status)) continue;
          const at = item.timestamp
            ? new Date(Number(item.timestamp) * 1000).toISOString()
            : undefined;
          const error = item.errors?.[0]?.title;
          updates.push({
            providerMessageId: item.id,
            eventId: `${item.id}:${item.status}`,
            status: item.status as StatusUpdate['status'],
            ...(at && !Number.isNaN(Date.parse(at)) ? { at } : {}),
            ...(error ? { error: error.slice(0, 300) } : {}),
          });
        }
    return updates;
  }
}
