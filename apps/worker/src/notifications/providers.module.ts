import { Global, Module } from '@nestjs/common';
import { createProviders, providerConfigFromEnv, type Providers } from '@medtravel/notifications';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';

/** Injection token for the email, SMS and WhatsApp adapters. */
export const NOTIFICATION_PROVIDERS = Symbol('NOTIFICATION_PROVIDERS');

@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_PROVIDERS,
      inject: [ENV],
      useFactory: (env: Env): Providers => createProviders(providerConfigFromEnv(env)),
    },
  ],
  exports: [NOTIFICATION_PROVIDERS],
})
export class ProvidersModule {}
