import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** OWASP's argon2id minimum: 19 MiB, two passes, one lane. (`algorithm: 2` is Argon2id; the package's enum is `const`.) */
const OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  /** A hash to spend time on when the account does not exist, so the answer takes as long as for a real one. */
  private dummy: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(stored: string | null, password: string): Promise<boolean> {
    if (!stored) {
      this.dummy ??= hash('not-a-real-password', OPTIONS);
      await verify(await this.dummy, password).catch(() => false);
      return false;
    }
    return verify(stored, password).catch(() => false);
  }
}
