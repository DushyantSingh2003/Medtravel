import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** A random URL-safe secret: 32 bytes is 256 bits. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export const hmacHex = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

/** Compares two strings without leaking, through timing, how many leading characters matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A 6-digit code, uniformly random (no modulo bias). */
export const randomCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** No 0, 1, I, L or O: a code read from paper or a screen is not mistyped. */
const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A backup code as shown to the user: `ABCDE-FGHJK` (50 bits). */
export function randomBackupCode(): string {
  const pick = () =>
    Array.from({ length: 5 }, () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

/** What is stored and compared for a backup code: case and the hyphen do not matter. */
export const normalizeBackupCode = (code: string): string => code.replace(/-/g, '').toUpperCase();
