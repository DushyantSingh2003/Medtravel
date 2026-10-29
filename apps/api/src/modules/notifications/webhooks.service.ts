import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import {
  applyStatusUpdate,
  verifyWebhookSignature,
  type Providers,
} from '@medtravel/notifications';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { PRISMA } from '../../database/database.module.js';
import { NOTIFICATION_PROVIDERS } from './notifications.providers.js';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: Providers,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get secret(): string {
    return this.env.NOTIFICATION_WEBHOOK_SECRET;
  }

  get verifyToken(): string {
    return this.env.WHATSAPP_VERIFY_TOKEN;
  }

  verify(rawBody: Buffer, signature: string | undefined): boolean {
    return verifyWebhookSignature(rawBody, signature, this.secret);
  }

  /** Applies each update the active provider of that channel can read from the body. */
  async apply(
    channel: 'sms' | 'whatsapp',
    body: unknown,
  ): Promise<{ applied: number; ignored: number }> {
    const provider = channel === 'sms' ? this.providers.sms : this.providers.whatsapp;
    let applied = 0;
    let ignored = 0;
    for (const update of provider.parseStatus(body)) {
      const outcome = await applyStatusUpdate(this.prisma, channel, update);
      if (outcome === 'applied') applied += 1;
      else ignored += 1;
    }
    return { applied, ignored };
  }
}
