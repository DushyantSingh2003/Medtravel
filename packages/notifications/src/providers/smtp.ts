import nodemailer from 'nodemailer';
import type { EmailMessage, EmailProvider, Sent } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
}

/** Email over SMTP: Mailpit in development, Amazon SES (its SMTP interface) or any relay in production. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      ...(config.user ? { auth: { user: config.user, pass: config.pass ?? '' } } : {}),
    });
  }

  async send(message: EmailMessage): Promise<Sent> {
    const info = await this.transport.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.headers ? { headers: message.headers } : {}),
    });
    return { id: String(info.messageId) };
  }
}
