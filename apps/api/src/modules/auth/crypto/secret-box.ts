import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for values that must be read back (a TOTP secret), unlike passwords and tokens which are only hashed.
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each base64url. The key is 32 bytes given as 64 hex characters.
 */
export function encryptSecret(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(keyHex: string, stored: string): string {
  const [version, iv, tag, ciphertext, extra] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined)
    throw new Error('Unreadable secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyHex, 'hex'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
