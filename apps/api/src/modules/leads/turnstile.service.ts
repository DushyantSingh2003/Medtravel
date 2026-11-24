import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Asks Cloudflare whether a visitor passed the Turnstile challenge on the enquiry form. */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  constructor(@Inject(ENV) private readonly env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'NODE_ENV'>) {}

  /**
   * True when the token is good. With no secret configured (development and tests; production refuses to start without one) every
   * token passes. A Cloudflare outage fails closed: a visitor is asked to try again rather than letting bots through.
   */
  async verify(token: string, ip: string | null): Promise<boolean> {
    const secret = this.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      if (this.env.NODE_ENV !== 'test') this.logger.warn('Turnstile is not configured: accepting the token');
      return true;
    }
    try {
      const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: unknown };
      return result.success === true;
    } catch {
      return false;
    }
  }
}
