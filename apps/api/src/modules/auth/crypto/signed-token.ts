import { createHmac } from 'node:crypto';
import { safeEqual } from './tokens.js';

/**
 * A compact signed token: `base64url(json).base64url(hmac)`. Used for the short-lived access token and the two-factor
 * challenge. Not encrypted: it carries ids and an expiry, nothing secret. `typ` keeps one kind of token from being
 * accepted as another.
 */
export interface TokenPayload {
  typ: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
  [claim: string]: string | number | boolean | null;
}

const sign = (secret: string, body: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(secret: string, payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

/** The payload when the signature is valid, the type matches and the token has not expired; otherwise null. */
export function verifyToken(
  secret: string,
  token: string,
  typ: string,
  nowMs = Date.now(),
): TokenPayload | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, sign(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.typ !== typ || typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs)
      return null;
    return payload;
  } catch {
    return null;
  }
}
