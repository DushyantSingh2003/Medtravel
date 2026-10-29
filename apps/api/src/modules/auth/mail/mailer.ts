import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Providers } from '@medtravel/notifications';
import nodemailer from 'nodemailer';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import { RateLimiter } from '../../../auth/rate-limiter.js';
import { NOTIFICATION_PROVIDERS } from '../../notifications/notifications.providers.js';

/** Most sign-in SMS the whole API sends in an hour. */
const SMS_PER_HOUR = 1000;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** What the message is for, so tests (and F-07's templates) can pick it out. */
  template:
    | 'verify_email'
    | 'password_reset'
    | 'login_code'
    | 'invitation'
    | 'magic_link'
    | 'account_exists';
  /** `sms` for a phone number: only captured until F-07 adds the SMS channel. */
  channel?: 'email' | 'sms';
  /** The link or code in the message, kept apart so it never has to be parsed out of the text. */
  secret?: string;
}

/**
 * Sends one sign-in message (a code, a link). These carry secrets, so they bypass the notification log of F-07 and go straight
 * to the email or SMS provider; everything else the platform says goes through `NotificationsService`.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private readonly transport;
  /** Messages kept by the `capture` transport, newest last. Only used in development and tests. */
  readonly captured: Mail[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: Providers,
    private readonly limiter: RateLimiter,
  ) {
    this.transport =
      env.EMAIL_TRANSPORT === 'smtp'
        ? nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false })
        : null;
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      this.captured.push(mail);
      if (this.captured.length > 200) this.captured.shift();
      // The address and the secret are personal data and credentials: log that a message was sent, not what is in it.
      this.logger.log(`captured ${mail.template} message`);
      return;
    }
    if (mail.channel === 'sms') {
      // Each SMS costs money and can be pointed at a stranger: cap one number, and the whole platform, so a flood of
      // made-up numbers cannot run up a bill.
      this.limiter.consume(`sms:to:${mail.to.replace(/\D/g, '')}`, 5, 3600);
      this.limiter.consume('sms:all', SMS_PER_HOUR, 3600);
      // A code is a secret: it goes straight to the provider and is not written to the notification log.
      await this.providers.sms.send({ to: mail.to, text: mail.text });
      return;
    }
    await this.transport.sendMail({
      from: this.env.EMAIL_FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    });
  }
}
