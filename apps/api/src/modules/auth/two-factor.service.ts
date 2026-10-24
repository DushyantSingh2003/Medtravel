import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { AUTH_LIMITS, requiresTwoFactor } from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import type { Actor } from '../../auth/actor.js';
import { twoFactorEnforced } from '../../auth/auth.guard.js';
import { RateLimiter } from '../../auth/rate-limiter.js';
import type { RequestContext } from '../../common/request-context.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { SessionService } from '../../auth/session.service.js';
import { PRISMA } from '../../database/database.module.js';
import { hmacHex, normalizeBackupCode, randomBackupCode, safeEqual } from './crypto/tokens.js';
import { PasswordService } from './password.service.js';
import { SignInService, type SignInOutcome } from './sign-in.service.js';
import { TotpService } from './totp.service.js';

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly totp: TotpService,
    private readonly passwords: PasswordService,
    private readonly signIn: SignInService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  private backupHash(code: string): string {
    return hmacHex(this.env.AUTH_TOKEN_SECRET, `backup:${normalizeBackupCode(code)}`);
  }

  /** Starts enrolment: a new secret, kept (encrypted) but not yet active until a code from the app proves it works. */
  async setup(actor: Actor) {
    const user = await this.signIn.accountById(actor.userId);
    if (!user) throw new UnauthorizedException('Sign in again');
    if (user.twoFactorEnabled)
      throw new ConflictException('Two-factor authentication is already on');
    const secret = this.totp.newSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: this.totp.encrypt(secret) },
    });
    return { secret, ...(await this.totp.enrolment(secret, user.email ?? user.name)) };
  }

  private async newBackupCodes(
    db: Pick<PrismaClient, 'backupCode'>,
    userId: string,
  ): Promise<string[]> {
    const codes = Array.from({ length: AUTH_LIMITS.backupCodeCount }, randomBackupCode);
    await db.backupCode.deleteMany({ where: { userId } });
    await db.backupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: this.backupHash(code) })),
    });
    return codes;
  }

  /** Finishes enrolment with a code from the app: turns 2FA on, marks this session as verified, returns the backup codes (once). */
  async enable(actor: Actor, code: string, context: RequestContext): Promise<string[]> {
    this.limiter.consume(`2fa:enable:${actor.userId}`, 10, 900);
    const user = await this.signIn.accountById(actor.userId);
    if (!user) throw new UnauthorizedException('Sign in again');
    if (user.twoFactorEnabled)
      throw new ConflictException('Two-factor authentication is already on');
    if (!user.twoFactorSecret) throw new ConflictException('Start the setup first');
    this.signIn.assertNotLocked(user);
    if (!this.totp.verify(user.twoFactorSecret, code))
      return this.signIn.fail(user, context, 'two_factor_enable');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
      await tx.session.update({
        where: { id: actor.sessionId },
        data: { twoFactorVerifiedAt: new Date() },
      });
      const codes = await this.newBackupCodes(tx, user.id);
      // Whoever was signed in somewhere else is no longer trusted with the new factor.
      await this.sessions.revokeAll(tx, user.id, actor.sessionId);
      await this.audit.record(tx, context, {
        action: 'auth.two_factor_enabled',
        entityType: 'User',
        entityId: user.id,
      });
      return codes;
    });
  }

  /** Second step of a sign-in: the challenge token from the password step, plus a 6-digit code or a backup code. */
  async challenge(token: string, code: string, context: RequestContext): Promise<SignInOutcome> {
    const userId = this.signIn.userIdOfChallenge(token);
    if (!userId) throw new UnauthorizedException('Sign in again');
    this.limiter.consume(`2fa:challenge:${userId}`, 15, 900);
    const user = await this.signIn.accountById(userId);
    if (!user || user.status !== 'active' || !user.twoFactorEnabled || !user.twoFactorSecret)
      throw new UnauthorizedException('Sign in again');
    this.signIn.assertNotLocked(user);
    const valid = /^\d{6}$/.test(code)
      ? this.totp.verify(user.twoFactorSecret, code)
      : await this.useBackupCode(user.id, code);
    if (!valid) return this.signIn.fail(user, context, 'two_factor');
    await this.signIn.clearFailures(user);
    return this.signIn.open(user, context, true, 'two_factor');
  }

  private async useBackupCode(userId: string, code: string): Promise<boolean> {
    const hash = this.backupHash(code);
    const candidates = await this.prisma.backupCode.findMany({
      where: { userId, usedAt: null },
      select: { id: true, codeHash: true },
    });
    const match = candidates.find((candidate) => safeEqual(candidate.codeHash, hash));
    if (!match) return false;
    // Single use, even if two requests race with the same code.
    const used = await this.prisma.backupCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  /** Turns 2FA off. Only for roles where it is optional; needs the password and a current code. */
  async disable(
    actor: Actor,
    body: { password: string; code: string },
    context: RequestContext,
  ): Promise<void> {
    this.limiter.consume(`2fa:disable:${actor.userId}`, 5, 900);
    const user = await this.signIn.accountById(actor.userId);
    if (!user?.twoFactorEnabled || !user.twoFactorSecret)
      throw new ConflictException('Two-factor authentication is not on');
    if (requiresTwoFactor(user.role) && twoFactorEnforced(this.env)) {
      throw new ForbiddenException(
        'Two-factor authentication is required for your role and cannot be turned off',
      );
    }
    this.signIn.assertNotLocked(user);
    if (
      !(await this.passwords.verify(user.passwordHash, body.password)) ||
      !this.totp.verify(user.twoFactorSecret, body.code)
    ) {
      return this.signIn.fail(user, context, 'two_factor_disable');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.backupCode.deleteMany({ where: { userId: user.id } });
      await this.audit.record(tx, context, {
        action: 'auth.two_factor_disabled',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  /** Replaces the backup codes (the old ones stop working) after proving a current code. */
  async regenerateBackupCodes(
    actor: Actor,
    code: string,
    context: RequestContext,
  ): Promise<string[]> {
    this.limiter.consume(`2fa:backup:${actor.userId}`, 5, 900);
    const user = await this.signIn.accountById(actor.userId);
    if (!user?.twoFactorEnabled || !user.twoFactorSecret)
      throw new ConflictException('Two-factor authentication is not on');
    this.signIn.assertNotLocked(user);
    if (!this.totp.verify(user.twoFactorSecret, code))
      return this.signIn.fail(user, context, 'backup_codes');
    return this.prisma.$transaction(async (tx) => {
      const codes = await this.newBackupCodes(tx, user.id);
      await this.audit.record(tx, context, {
        action: 'auth.backup_codes_regenerated',
        entityType: 'User',
        entityId: user.id,
      });
      return codes;
    });
  }
}
