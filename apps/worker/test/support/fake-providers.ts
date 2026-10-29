import {
  PermanentDeliveryError,
  type EmailMessage,
  type Providers,
  type SmsMessage,
  type WhatsAppTemplateMessage,
} from '@medtravel/notifications';

type Channel = 'email' | 'sms' | 'whatsapp';

export interface Recording {
  providers: Providers;
  emails: EmailMessage[];
  sms: SmsMessage[];
  whatsappTemplates: WhatsAppTemplateMessage[];
  whatsappTexts: SmsMessage[];
  /** How calls on a channel end: `retry` throws an ordinary error, `permanent` a final refusal. */
  failWith: Partial<Record<Channel, 'retry' | 'permanent'>>;
}

/** Email, SMS and WhatsApp adapters that record what they were asked to send, and can be told to fail. */
export function recordingProviders(): Recording {
  let counter = 0;
  const recording: Recording = {
    emails: [],
    sms: [],
    whatsappTemplates: [],
    whatsappTexts: [],
    failWith: {},
    providers: undefined as unknown as Providers,
  };
  const next = (prefix: string) => ({ id: `${prefix}-${(counter += 1)}` });
  const check = (channel: Channel) => {
    const mode = recording.failWith[channel];
    if (mode === 'retry') throw new Error('provider unavailable');
    if (mode === 'permanent') throw new PermanentDeliveryError('number rejected');
  };
  recording.providers = {
    email: {
      name: 'test-email',
      send: async (message) => {
        check('email');
        recording.emails.push(message);
        return next('mail');
      },
    },
    sms: {
      name: 'test-sms',
      send: async (message) => {
        check('sms');
        recording.sms.push(message);
        return next('sms');
      },
      parseStatus: () => [],
    },
    whatsapp: {
      name: 'test-wa',
      sendTemplate: async (message) => {
        check('whatsapp');
        recording.whatsappTemplates.push(message);
        return next('wa');
      },
      sendText: async (message) => {
        check('whatsapp');
        recording.whatsappTexts.push(message);
        return next('wa');
      },
      parseStatus: () => [],
    },
  };
  return recording;
}
