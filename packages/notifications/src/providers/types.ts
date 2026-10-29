import type { StatusUpdate } from '@medtravel/contracts';

/** A message the provider refused for good (a bad number, a rejected template): retrying cannot help. */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

export interface Sent {
  /** The provider's id for the message, matched against its delivery callbacks. */
  id: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Lets a development adapter show who a message pretending to be an SMS or WhatsApp was meant for. */
  headers?: Record<string, string>;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<Sent>;
}

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<Sent>;
  /** Reads the provider's own delivery callback into updates; anything it cannot read gives none. */
  parseStatus(body: unknown): StatusUpdate[];
}

export interface WhatsAppTemplateMessage {
  to: string;
  /** The approved template's name at the provider. */
  template: string;
  language: string;
  parameters: string[];
  /** The same message as plain text, for adapters that do not use templates (development). */
  text: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  /** A template message: allowed at any time. */
  sendTemplate(message: WhatsAppTemplateMessage): Promise<Sent>;
  /** Free text: the provider refuses it outside the 24-hour window, so the engine checks first. */
  sendText(message: SmsMessage): Promise<Sent>;
  parseStatus(body: unknown): StatusUpdate[];
}

export interface Providers {
  email: EmailProvider;
  sms: SmsProvider;
  whatsapp: WhatsAppProvider;
}
