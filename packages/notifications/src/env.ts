import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ProviderConfig } from './providers/index.js';

export const DEV_WEBHOOK_SECRET = 'dev-notification-webhook-secret';
export const DEV_VERIFY_TOKEN = 'dev-whatsapp-verify-token';

/**
 * Settings of the three channels, shared by the API and the worker so both build their providers the same way. Spread into each
 * app's own environment schema; `refineProviderEnv` adds the cross-field rules.
 */
export const PROVIDER_ENV_SHAPE = {
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('MedTravel <noreply@medtravel.local>'),
  SMS_PROVIDER: z.enum(['dev', 'twilio', 'msg91']).default('dev'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(['dev', 'meta']).default('dev'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /** Signs the delivery callbacks of the SMS and WhatsApp providers (HMAC-SHA256 of the body). For Meta it is the app secret. */
  NOTIFICATION_WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
  /** The token WhatsApp's subscription check sends in the URL. Separate from the signing secret, which must never travel in an address. */
  WHATSAPP_VERIFY_TOKEN: z.string().min(16).default(DEV_VERIFY_TOKEN),
};

export type ProviderEnv = z.infer<z.ZodObject<typeof PROVIDER_ENV_SHAPE>>;

/** Rules across settings: a real provider needs its keys, and production may not use the development stand-ins or secret. */
export function refineProviderEnv(
  env: ProviderEnv & { NODE_ENV: string },
  issue: (path: string, message: string) => void,
): void {
  if (
    env.SMS_PROVIDER === 'twilio' &&
    !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)
  )
    issue('SMS_PROVIDER', 'Twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM');
  if (env.SMS_PROVIDER === 'msg91' && !(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID))
    issue('SMS_PROVIDER', 'MSG91 needs MSG91_AUTH_KEY and MSG91_TEMPLATE_ID');
  if (
    env.WHATSAPP_PROVIDER === 'meta' &&
    !(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN)
  )
    issue('WHATSAPP_PROVIDER', 'WhatsApp needs WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN');
  if (env.NODE_ENV === 'production') {
    if (env.SMS_PROVIDER === 'dev') issue('SMS_PROVIDER', 'Set a real SMS provider in production');
    if (env.WHATSAPP_PROVIDER === 'dev')
      issue('WHATSAPP_PROVIDER', 'Set a real WhatsApp provider in production');
    if (env.WHATSAPP_VERIFY_TOKEN === DEV_VERIFY_TOKEN)
      issue('WHATSAPP_VERIFY_TOKEN', 'Set a real WHATSAPP_VERIFY_TOKEN in production');
    if (env.NOTIFICATION_WEBHOOK_SECRET === env.WHATSAPP_VERIFY_TOKEN)
      issue(
        'WHATSAPP_VERIFY_TOKEN',
        'WHATSAPP_VERIFY_TOKEN must differ from NOTIFICATION_WEBHOOK_SECRET',
      );
    if (env.NOTIFICATION_WEBHOOK_SECRET === DEV_WEBHOOK_SECRET)
      issue('NOTIFICATION_WEBHOOK_SECRET', 'Set a real NOTIFICATION_WEBHOOK_SECRET in production');
  }
}

/** The adapter configuration for a validated environment. */
export function providerConfigFromEnv(env: ProviderEnv): ProviderConfig {
  return {
    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.EMAIL_FROM,
      ...(env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : {}),
    },
    sms: {
      provider: env.SMS_PROVIDER,
      ...(env.SMS_PROVIDER === 'twilio'
        ? {
            twilio: {
              accountSid: env.TWILIO_ACCOUNT_SID ?? '',
              authToken: env.TWILIO_AUTH_TOKEN ?? '',
              from: env.TWILIO_FROM ?? '',
            },
          }
        : {}),
      ...(env.SMS_PROVIDER === 'msg91'
        ? { msg91: { authKey: env.MSG91_AUTH_KEY ?? '', templateId: env.MSG91_TEMPLATE_ID ?? '' } }
        : {}),
    },
    whatsapp: {
      provider: env.WHATSAPP_PROVIDER,
      ...(env.WHATSAPP_PROVIDER === 'meta'
        ? {
            meta: {
              phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
              accessToken: env.WHATSAPP_ACCESS_TOKEN ?? '',
            },
          }
        : {}),
    },
  };
}

/** Whether `signature` (`sha256=<hex>` or bare hex) is the HMAC-SHA256 of the raw body under the secret. */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const given = Buffer.from(signature.replace(/^sha256=/i, ''), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
