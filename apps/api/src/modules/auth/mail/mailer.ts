import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';

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
 * Sends one message. F-07 (the notification engine) puts real templates, languages and channels behind the same call;
 * until then these are plain-text messages in English.
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name);
  private readonly transport;
  /** Messages kept by the `capture` transport, newest last. Only used in development and tests. */
  readonly captured: Mail[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
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
      this.logger.warn('SMS is not available until F-07; the code was not sent');
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
