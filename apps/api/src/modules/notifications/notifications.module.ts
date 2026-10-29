import { Global, Module } from '@nestjs/common';
import { createProviders, providerConfigFromEnv } from '@medtravel/notifications';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { NotificationsController } from './notifications.controller.js';
import { NOTIFICATION_PROVIDERS } from './notifications.providers.js';
import { NotificationsService } from './notifications.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

/** Global so any module can inject `NotificationsService` and call `send` inside its own transaction. */
@Global()
@Module({
  controllers: [NotificationsController, WebhooksController],
  providers: [
    NotificationsService,
    WebhooksService,
    {
      provide: NOTIFICATION_PROVIDERS,
      inject: [ENV],
      useFactory: (env: Env) => createProviders(providerConfigFromEnv(env)),
    },
  ],
  exports: [NotificationsService, NOTIFICATION_PROVIDERS],
})
export class NotificationsModule {}
