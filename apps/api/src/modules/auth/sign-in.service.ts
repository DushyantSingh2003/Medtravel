import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import {
  AUTH_LIMITS,
  requiresTwoFactor,
  type AuthUser,
  type LoginResult,
  type Role,
} from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import { twoFactorEnforced } from '../../auth/auth.guard.js';
import { SessionService, type SessionResult } from '../../auth/session.service.js';
import { signToken, verifyToken } from './crypto/signed-token.js';
import type { RequestContext } from '../../common/request-context.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { PRISMA } from '../../database/database.module.js';

const TWO_FACTOR_TOKEN = 'two_factor';
const TWO_FACTOR_TOKEN_SECONDS = 300;

/** The columns every sign-in path reads about a user. */
export const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  language: true,
  status: true,
  deletedAt: true,
  passwordHash: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  emailVerifiedAt: true,
  failedLoginCount: true,
  lockedUntil: true,
} as const;

export interface Account {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  language: string;
  status: 'invited' | 'active' | 'suspended' | 'deactivated';
  deletedAt: Date | null;
  passwordHash: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  emailVerifiedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/** What a sign-in step answers: the JSON body, and the session whose cookies the controller must set. */
export interface SignInOutcome {
  body: LoginResult;
  session?: SessionResult;
}

/** The parts of signing in that every route shares: lockout, deciding whether a second factor is owed, opening a session. */
@Injectable()
export class SignInService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** What the portal needs to know about the signed-in user. `limited` is true until a required second factor is done. */
  view(user: Account, limited: boolean, scopeCaseId: string | null = null): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      language: user.language,
      emailVerified: user.emailVerifiedAt !== null,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorRequired: requiresTwoFactor(user.role) && twoFactorEnforced(this.env),
      access: limited ? 'two_factor_setup' : 'full',
      scopeCaseId,
    };
  }

  twoFactorChallengeToken(userId: string): string {
    const exp = Math.floor(Date.now() / 1000) + TWO_FACTOR_TOKEN_SECONDS;
    return signToken(this.env.AUTH_TOKEN_SECRET, { typ: TWO_FACTOR_TOKEN, exp, uid: userId });
  }

  /** The user a two-factor challenge token was issued to, or null when the token is bad or old. */
  userIdOfChallenge(token: string): string | null {
    const payload = verifyToken(this.env.AUTH_TOKEN_SECRET, token, TWO_FACTOR_TOKEN);
    return payload && typeof payload['uid'] === 'string' ? payload['uid'] : null;
  }

  /**
   * Called once the person has proved who they are (password, or a code). If they have a second factor they must now
   * prove it; otherwise a session opens. A user whose role requires 2FA but who has not enrolled gets a limited
   * session that can do nothing but enrol.
   */
  async complete(
    user: Account,
    context: RequestContext,
    method: 'password' | 'code',
  ): Promise<SignInOutcome> {
    if (user.twoFactorEnabled) {
      return {
        body: {
          status: 'two_factor_required',
          challengeToken: this.twoFactorChallengeToken(user.id),
          user: null,
        },
      };
    }
    const limited = requiresTwoFactor(user.role) && twoFactorEnforced(this.env);
    return this.open(user, context, !limited, method);
  }

  /** Opens the session itself (after a password, a code, or a second factor). */
  async open(
    user: Account,
    context: RequestContext,
    twoFactorVerified: boolean,
    method: string,
  ): Promise<SignInOutcome> {
    const session = await this.sessions.create(this.prisma, { user, twoFactorVerified, context });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record(
      this.prisma,
      {
        ...context,
        actor: {
          userId: user.id,
          role: user.role,
          sessionId: session.sessionId,
          scopeCaseId: null,
        },
      },
      {
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        after: { method, twoFactorVerified },
      },
    );
    return {
      body: {
        status: 'signed_in',
        challengeToken: null,
        user: this.view(user, !twoFactorVerified),
      },
      session,
    };
  }

  /**
   * Refuses while the account is locked. The answer is the same as for a wrong password, so that the lock does not
   * tell a stranger which addresses have accounts.
   */
  assertNotLocked(user: Pick<Account, 'lockedUntil'>): void {
    if (user.lockedUntil && user.lockedUntil > new Date())
      throw new UnauthorizedException('Incorrect email, password or code');
  }

  /** Counts a wrong password or code; the fifth in a row locks the account. Always ends in a 401. */
  async fail(
    user: Pick<Account, 'id' | 'role'>,
    context: RequestContext,
    reason: string,
  ): Promise<never> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const locked = failedLoginCount >= AUTH_LIMITS.maxFailedAttempts;
    if (locked) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + AUTH_LIMITS.lockoutMinutes * 60_000),
        },
      });
    }
    await this.audit.record(
      this.prisma,
      { ...context, actor: null },
      {
        action: locked ? 'auth.account_locked' : 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        after: { reason },
      },
    );
    throw new UnauthorizedException('Incorrect email, password or code');
  }

  async clearFailures(
    user: Pick<Account, 'id' | 'failedLoginCount' | 'lockedUntil'>,
  ): Promise<void> {
    if (user.failedLoginCount === 0 && !user.lockedUntil) return;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  async accountById(userId: string): Promise<Account | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: ACCOUNT_SELECT,
    });
  }
}
