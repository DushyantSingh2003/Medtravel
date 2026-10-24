import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { decryptSecret, encryptSecret } from './crypto/secret-box.js';

const ISSUER = 'MedTravel';

@Injectable()
export class TotpService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  newSecret(): string {
    return generateSecret();
  }

  encrypt(secret: string): string {
    return encryptSecret(this.env.AUTH_ENCRYPTION_KEY, secret);
  }

  /** The app's QR code and the otpauth link behind it. */
  async enrolment(
    secret: string,
    account: string,
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
    const otpauthUrl = generateURI({ issuer: ISSUER, label: account, secret });
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 192 });
    return {
      otpauthUrl,
      qrCodeDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  }

  /** Whether `code` is the current code for the stored (encrypted) secret, allowing one 30-second step either way. */
  verify(storedSecret: string, code: string): boolean {
    const secret = decryptSecret(this.env.AUTH_ENCRYPTION_KEY, storedSecret);
    return verifySync({ secret, token: code, epochTolerance: 30 }).valid;
  }
}
