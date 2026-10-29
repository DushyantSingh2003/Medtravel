import { DevSmsProvider, DevWhatsAppProvider } from './dev.js';
import { MetaWhatsAppProvider, type MetaWhatsAppConfig } from './meta.js';
import { Msg91SmsProvider, type Msg91Config } from './msg91.js';
import { SmtpEmailProvider, type SmtpConfig } from './smtp.js';
import { TwilioSmsProvider, type TwilioConfig } from './twilio.js';
import type { Providers } from './types.js';

export * from './types.js';
export { SmtpEmailProvider, type SmtpConfig } from './smtp.js';
export { DevSmsProvider, DevWhatsAppProvider } from './dev.js';
export { TwilioSmsProvider, type TwilioConfig } from './twilio.js';
export { Msg91SmsProvider, type Msg91Config } from './msg91.js';
export { MetaWhatsAppProvider, type MetaWhatsAppConfig } from './meta.js';

export interface ProviderConfig {
  email: SmtpConfig;
  sms: { provider: 'dev' | 'twilio' | 'msg91'; twilio?: TwilioConfig; msg91?: Msg91Config };
  whatsapp: { provider: 'dev' | 'meta'; meta?: MetaWhatsAppConfig };
}

/** Builds the three channel adapters from configuration, so switching provider is a setting and not a code change. */
export function createProviders(config: ProviderConfig): Providers {
  const email = new SmtpEmailProvider(config.email);
  let sms: Providers['sms'] = new DevSmsProvider(email);
  if (config.sms.provider === 'twilio') {
    if (!config.sms.twilio) throw new Error('SMS_PROVIDER=twilio needs the Twilio settings');
    sms = new TwilioSmsProvider(config.sms.twilio);
  } else if (config.sms.provider === 'msg91') {
    if (!config.sms.msg91) throw new Error('SMS_PROVIDER=msg91 needs the MSG91 settings');
    sms = new Msg91SmsProvider(config.sms.msg91);
  }
  let whatsapp: Providers['whatsapp'] = new DevWhatsAppProvider(email);
  if (config.whatsapp.provider === 'meta') {
    if (!config.whatsapp.meta) throw new Error('WHATSAPP_PROVIDER=meta needs the Meta settings');
    whatsapp = new MetaWhatsAppProvider(config.whatsapp.meta);
  }
  return { email, sms, whatsapp };
}
