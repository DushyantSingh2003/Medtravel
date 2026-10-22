import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import {
  AUTH_LIMITS,
  canSignInWithOtp,
  type AuthUser,
  type SessionInfo,
} from '@medtravel/contracts';
import { AuditService } from '../../audit/audit.service.js';
import type { Actor } from '../../auth/actor.js';
import { RateLimiter } from '../../auth/rate-limiter.js';
import { SessionService, type RefreshOutcome } from '../../auth/session.service.js';
import type { RequestContext } from '../../common/request-context.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { PRISMA } from '../../database/database.module.js';
import { hmacHex, randomCode, randomToken, safeEqual, sha256Hex } from './crypto/tokens.js';
import { Mailer } from './mail/mailer.js';
import { PasswordService } from './password.service.js';
import {
  ACCOUNT_SELECT,
  SignInService,
  type Account,
  type SignInOutcome,
} from './sign-in.service.js';

const HOUR_MS = 3_600_000;

/** Prisma's unique-constraint error code; the only database error these flows expect and handle. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly signIn: SignInService,
    private readonly mailer: Mailer,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  private link(language: string, path: string, token: string): string {
    return `${this.env.PORTAL_URL.replace(/\/$/, '')}/${language === 'ar' ? 'ar' : 'en'}/${path}?token=${token}`;
  }

  private codeHash(target: string, code: string): string {
    return hmacHex(this.env.AUTH_TOKEN_SECRET, `otp:${target}:${code}`);
  }

  // ---- sign-up ----------------------------------------------------------------------------------------------
  /**
   * Patient sign-up with email and password. Answers the same whether or not the address already has an account (an
   * existing one is told by email), so the form cannot be used to find out who is registered.
   */
  async register(
    body: { name: string; email: string; password: string; language: 'en' | 'ar' },
    context: RequestContext,
  ): Promise<void> {
    this.limiter.consume(`register:email:${body.email}`, 5, 3600);
    const passwordHash = await this.passwords.hash(body.password);
    try {
      const token = randomToken();
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: body.name,
            email: body.email,
            role: 'patient',
            language: body.language,
            status: 'active',
            passwordHash,
            passwordChangedAt: new Date(),
          },
          select: { id: true },
        });
        await tx.patient.create({
          data: {
            userId: created.id,
            fullName: body.name,
            email: body.email,
            preferredLanguage: body.language,
          },
        });
        await tx.authChallenge.create({
          data: {
            kind: 'email_verification',
            target: body.email,
            tokenHash: sha256Hex(token),
            userId: created.id,
            expiresAt: new Date(Date.now() + AUTH_LIMITS.emailVerificationHours * HOUR_MS),
          },
        });
        await this.audit.record(tx, context, {
          action: 'auth.registered',
          entityType: 'User',
          entityId: created.id,
        });
      });
      await this.mailer.send({
        to: body.email,
        subject: 'Confirm your email address',
        text: `Welcome to MedTravel. Confirm your email address: ${this.link(body.language, 'verify-email', token)}`,
        template: 'verify_email',
        secret: token,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.mailer.send({
        to: body.email,
        subject: 'You already have a MedTravel account',
        text: `Someone tried to sign up with this address, but it already has an account. You can sign in, or reset your password: ${this.env.PORTAL_URL}/${body.language}/forgot-password`,
        template: 'account_exists',
      });
    }
  }

  // ---- password sign-in -------------------------------------------------------------------------------------
  async login(
    body: { email: string; password: string },
    context: RequestContext,
  ): Promise<SignInOutcome> {
    this.limiter.consume(`login:email:${body.email}`, 10, 900);
    const user = (await this.prisma.user.findFirst({
      where: { email: body.email, deletedAt: null },
      select: ACCOUNT_SELECT,
    })) as Account | null;
    if (user) this.signIn.assertNotLocked(user);
    const correct = await this.passwords.verify(user?.passwordHash ?? null, body.password);
    if (!user || !correct || user.status !== 'active') {
      if (user && user.status === 'active') return this.signIn.fail(user, context, 'password');
      throw new UnauthorizedException('Incorrect email, password or code');
    }
    await this.signIn.clearFailures(user);
    return this.signIn.complete(user, context, 'password');
  }

  // ---- one-time code sign-in --------------------------------------------------------------------------------
  /**
   * Sends a 6-digit code to an email address or phone number. Patients, attendants and agents only; an unknown address
   * gets a code too, and signing in with it creates a patient account. Always answers the same.
   */
  async requestLoginCode(identifier: string): Promise<void> {
    this.limiter.consume(`otp:request:${identifier}`, 5, 900);
    const isEmail = identifier.includes('@');
    const user = await this.prisma.user.findFirst({
      where: { deletedAt: null, ...(isEmail ? { email: identifier } : { phone: identifier }) },
      select: { id: true, role: true, status: true, language: true },
    });
    if (user && (!canSignInWithOtp(user.role) || user.status !== 'active')) return;
    const code = randomCode();
    await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.deleteMany({
        where: { kind: 'login_code', target: identifier, consumedAt: null },
      });
      await tx.authChallenge.create({
        data: {
          kind: 'login_code',
          target: identifier,
          codeHash: this.codeHash(identifier, code),
          expiresAt: new Date(Date.now() + AUTH_LIMITS.otpMinutes * 60_000),
          ...(user ? { userId: user.id } : { meta: { signup: true } }),
        },
      });
    });
    await this.mailer.send({
      to: identifier,
      channel: isEmail ? 'email' : 'sms',
      subject: 'Your MedTravel sign-in code',
      text: `Your sign-in code is ${code}. It works for ${AUTH_LIMITS.otpMinutes} minutes. If you did not ask for it, ignore this message.`,
      template: 'login_code',
      secret: code,
    });
  }

  async verifyLoginCode(
    identifier: string,
    code: string,
    context: RequestContext,
  ): Promise<SignInOutcome> {
    this.limiter.consume(`otp:verify:${identifier}`, 10, 900);
    const challenge = await this.prisma.authChallenge.findFirst({
      where: {
        kind: 'login_code',
        target: identifier,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = new UnauthorizedException('That code is wrong or has expired');
    if (!challenge || !challenge.codeHash) throw invalid;
    if (challenge.attempts >= AUTH_LIMITS.otpMaxAttempts) throw invalid;
    if (!safeEqual(challenge.codeHash, this.codeHash(identifier, code))) {
      await this.prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid;
    }
    const isEmail = identifier.includes('@');
    const user = await this.prisma.$transaction(async (tx) => {
      // The code works once, even if two requests race with it.
      const consumed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return null;
      const verified = isEmail ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() };
      if (challenge.userId) {
        return tx.user.update({
          where: { id: challenge.userId },
          data: verified,
          select: ACCOUNT_SELECT,
        });
      }
      const created = await tx.user.create({
        data: {
          name: isEmail ? (identifier.split('@')[0] ?? 'Patient') : 'Patient',
          role: 'patient',
          status: 'active',
          ...(isEmail ? { email: identifier } : { phone: identifier }),
          ...verified,
        },
        select: ACCOUNT_SELECT,
      });
      await tx.patient.create({
        data: {
          userId: created.id,
          fullName: created.name,
          ...(isEmail ? { email: identifier } : { phone: identifier }),
        },
      });
      await this.audit.record(tx, context, {
        action: 'auth.registered',
        entityType: 'User',
        entityId: created.id,
        after: { via: 'code' },
      });
      return created;
    });
    if (!user || user.status !== 'active' || user.deletedAt) throw invalid;
    this.signIn.assertNotLocked(user);
    await this.signIn.clearFailures(user);
    return this.signIn.complete(user, context, 'code');
  }

  // ---- tokens and the current session -----------------------------------------------------------------------
  async refresh(
    cookie: string,
    context: RequestContext,
  ): Promise<SignInOutcome & { user: AuthUser }> {
    const outcome: RefreshOutcome = await this.sessions.refresh(cookie);
    if (!outcome.ok) {
      if (outcome.revokedUserId) {
        await this.audit.record(
          this.prisma,
          { ...context, actor: null },
          {
            action: 'auth.refresh_token_reuse',
            entityType: 'User',
            entityId: outcome.revokedUserId,
          },
        );
      }
      throw new UnauthorizedException('Sign in again');
    }
    const user = await this.signIn.accountById(outcome.userId);
    if (!user) throw new UnauthorizedException('Sign in again');
    const session = await this.prisma.session.findUnique({
      where: { id: outcome.result.sessionId },
      select: { twoFactorVerifiedAt: true },
    });
    const limited = session?.twoFactorVerifiedAt == null && this.requiresSecondFactor(user);
    const view = this.signIn.view(user, limited);
    return {
      body: { status: 'signed_in', challengeToken: null, user: view },
      session: outcome.result,
      user: view,
    };
  }

  private requiresSecondFactor(user: Account): boolean {
    return user.twoFactorEnabled || this.signIn.view(user, false).twoFactorRequired;
  }

  async me(actor: Actor, limited: boolean): Promise<AuthUser> {
    const user = await this.signIn.accountById(actor.userId);
    if (!user) throw new UnauthorizedException('Sign in again');
    return this.signIn.view(user, limited, actor.scopeCaseId);
  }

  /** Ends the session the request belongs to: by its access token, or failing that by its refresh token. Never fails. */
  async logout(
    accessToken: string | undefined,
    refreshCookie: string | undefined,
    context: RequestContext,
  ): Promise<void> {
    let sessionId = accessToken
      ? (await this.sessions.authenticate(accessToken))?.actor.sessionId
      : undefined;
    if (!sessionId && refreshCookie) {
      const [id, secret] = refreshCookie.split('.');
      if (id && secret) {
        const session = await this.prisma.session.findUnique({
          where: { id },
          select: { id: true, tokenHash: true },
        });
        if (session && safeEqual(session.tokenHash, sha256Hex(secret))) sessionId = session.id;
      }
    }
    if (!sessionId) return;
    await this.sessions.revoke(this.prisma, sessionId);
    await this.audit.record(this.prisma, context, {
      action: 'auth.logout',
      entityType: 'Session',
      entityId: sessionId,
    });
  }

  // ---- email address ----------------------------------------------------------------------------------------
  async verifyEmail(token: string, context: RequestContext): Promise<void> {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !challenge ||
      challenge.kind !== 'email_verification' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.userId
    ) {
      throw new NotFoundException('This link is not valid any more');
    }
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new NotFoundException('This link is not valid any more');
      await tx.user.update({
        where: { id: challenge.userId as string },
        data: { emailVerifiedAt: new Date() },
      });
      await this.audit.record(tx, context, {
        action: 'auth.email_verified',
        entityType: 'User',
        entityId: challenge.userId as string,
      });
    });
  }

  async resendVerification(actor: Actor): Promise<void> {
    this.limiter.consume(`verify:resend:${actor.userId}`, 3, 3600);
    const user = await this.signIn.accountById(actor.userId);
    if (!user?.email || user.emailVerifiedAt) return;
    const token = randomToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.deleteMany({
        where: { kind: 'email_verification', userId: user.id, consumedAt: null },
      });
      await tx.authChallenge.create({
        data: {
          kind: 'email_verification',
          target: user.email,
          tokenHash: sha256Hex(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + AUTH_LIMITS.emailVerificationHours * HOUR_MS),
        },
      });
    });
    await this.mailer.send({
      to: user.email,
      subject: 'Confirm your email address',
      text: `Confirm your email address: ${this.link(user.language, 'verify-email', token)}`,
      template: 'verify_email',
      secret: token,
    });
  }

  // ---- passwords --------------------------------------------------------------------------------------------
  /** Sends a reset link when the address has an account with a password. Always answers the same. */
  async forgotPassword(email: string): Promise<void> {
    this.limiter.consume(`reset:email:${email}`, 3, 3600);
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, status: 'active', passwordHash: { not: null } },
      select: { id: true, language: true },
    });
    if (!user) return;
    const token = randomToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.authChallenge.deleteMany({
        where: { kind: 'password_reset', userId: user.id, consumedAt: null },
      });
      await tx.authChallenge.create({
        data: {
          kind: 'password_reset',
          target: email,
          tokenHash: sha256Hex(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + AUTH_LIMITS.passwordResetMinutes * 60_000),
        },
      });
    });
    await this.mailer.send({
      to: email,
      subject: 'Reset your MedTravel password',
      text: `Choose a new password (the link works for ${AUTH_LIMITS.passwordResetMinutes} minutes): ${this.link(user.language, 'reset-password', token)}`,
      template: 'password_reset',
      secret: token,
    });
  }

  async resetPassword(token: string, password: string, context: RequestContext): Promise<void> {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !challenge ||
      challenge.kind !== 'password_reset' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.userId
    ) {
      throw new NotFoundException('This link is not valid any more');
    }
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new NotFoundException('This link is not valid any more');
      const userId = challenge.userId as string;
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      // Whoever had the old password is signed out everywhere.
      await this.sessions.revokeAll(tx, userId);
      await this.audit.record(tx, context, {
        action: 'auth.password_reset',
        entityType: 'User',
        entityId: userId,
      });
    });
  }

  async changePassword(
    actor: Actor,
    body: { currentPassword: string; newPassword: string },
    context: RequestContext,
  ): Promise<void> {
    this.limiter.consume(`password:change:${actor.userId}`, 5, 900);
    const user = await this.signIn.accountById(actor.userId);
    if (!user) throw new UnauthorizedException('Sign in again');
    this.signIn.assertNotLocked(user);
    if (!(await this.passwords.verify(user.passwordHash, body.currentPassword))) {
      return this.signIn.fail(user, context, 'password_change');
    }
    const passwordHash = await this.passwords.hash(body.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await this.sessions.revokeAll(tx, user.id, actor.sessionId);
      await this.audit.record(tx, context, {
        action: 'auth.password_changed',
        entityType: 'User',
        entityId: user.id,
      });
    });
  }

  // ---- devices ----------------------------------------------------------------------------------------------
  listSessions(actor: Actor): Promise<SessionInfo[]> {
    return this.sessions.list(actor.userId, actor.sessionId);
  }

  async revokeSession(actor: Actor, sessionId: string, context: RequestContext): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId: actor.userId, revokedAt: null },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Not found');
    await this.sessions.revoke(this.prisma, session.id);
    await this.audit.record(this.prisma, context, {
      action: 'auth.session_revoked',
      entityType: 'Session',
      entityId: session.id,
    });
  }

  async revokeOtherSessions(actor: Actor, context: RequestContext): Promise<void> {
    const { count } = await this.sessions.revokeAll(this.prisma, actor.userId, actor.sessionId);
    await this.audit.record(this.prisma, context, {
      action: 'auth.other_sessions_revoked',
      entityType: 'User',
      entityId: actor.userId,
      after: { count },
    });
  }

  /** Thrown by callers that need a plain 403 with a code the portal can act on. */
  static forbidden(code: string, message: string): HttpException {
    return new HttpException(
      { statusCode: HttpStatus.FORBIDDEN, message, code },
      HttpStatus.FORBIDDEN,
    );
  }
}
