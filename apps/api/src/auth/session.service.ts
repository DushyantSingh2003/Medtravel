import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@medtravel/db';
import { AUTH_LIMITS, type Role, type SessionKind } from '@medtravel/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { PRISMA, type Db } from '../database/database.module.js';
import type { RequestContext } from '../common/request-context.js';
import type { Actor } from './actor.js';
import type { SessionTokens } from './cookies.js';
import { signToken, verifyToken } from '../modules/auth/crypto/signed-token.js';
import { hmacHex, randomToken, safeEqual, sha256Hex } from '../modules/auth/crypto/tokens.js';
import { deviceLabel } from './device-label.js';

const ACCESS = 'access';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A refresh token presented again this soon after it was rotated is two tabs racing, not a theft. */
const ROTATION_GRACE_MS = 10_000;
const DAY_MS = 86_400_000;

/** What the guard needs to know about a signed-in request. */
export interface AuthenticatedSession {
  actor: Actor;
  twoFactorVerified: boolean;
  user: { id: string; role: Role; twoFactorEnabled: boolean; emailVerifiedAt: Date | null };
}

export interface CreateSession {
  user: { id: string; role: Role };
  kind?: SessionKind;
  twoFactorVerified: boolean;
  scopeCaseId?: string;
  /** Latest the session may live; defaults to the refresh token lifetime. */
  expiresAt?: Date;
  context: RequestContext;
}

export interface SessionResult {
  sessionId: string;
  tokens: SessionTokens;
}

export type RefreshOutcome =
  { ok: true; result: SessionResult; userId: string } | { ok: false; revokedUserId?: string };

@Injectable()
export class SessionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The value a CSRF cookie must carry for this session; unforgeable without the server secret. */
  csrfTokenFor(sessionId: string): string {
    return hmacHex(this.env.AUTH_TOKEN_SECRET, `csrf:${sessionId}`);
  }

  private tokensFor(
    sessionId: string,
    userId: string,
    refreshSecret: string,
    expiresAt: Date,
  ): SessionTokens {
    const accessMaxAgeSeconds = AUTH_LIMITS.accessTokenMinutes * 60;
    const exp = Math.floor(Date.now() / 1000) + accessMaxAgeSeconds;
    return {
      accessToken: signToken(this.env.AUTH_TOKEN_SECRET, {
        typ: ACCESS,
        exp,
        sid: sessionId,
        uid: userId,
      }),
      refreshToken: `${sessionId}.${refreshSecret}`,
      csrfToken: this.csrfTokenFor(sessionId),
      accessMaxAgeSeconds,
      refreshMaxAgeSeconds: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  async create(db: Db, options: CreateSession): Promise<SessionResult> {
    const id = randomUUID();
    const refreshSecret = randomToken();
    const expiresAt =
      options.expiresAt ?? new Date(Date.now() + AUTH_LIMITS.refreshTokenDays * DAY_MS);
    await db.session.create({
      data: {
        id,
        kind: options.kind ?? 'user',
        tokenHash: sha256Hex(refreshSecret),
        userAgent: options.context.userAgent,
        deviceLabel: deviceLabel(options.context.userAgent),
        ip: options.context.ip,
        twoFactorVerifiedAt: options.twoFactorVerified ? new Date() : null,
        expiresAt,
        lastUsedAt: new Date(),
        userId: options.user.id,
        ...(options.scopeCaseId ? { scopeCaseId: options.scopeCaseId } : {}),
      },
    });
    return { sessionId: id, tokens: this.tokensFor(id, options.user.id, refreshSecret, expiresAt) };
  }

  /** The session behind an access token, or null when the token is bad, expired, or the session or user is no longer valid. */
  async authenticate(accessToken: string): Promise<AuthenticatedSession | null> {
    const payload = verifyToken(this.env.AUTH_TOKEN_SECRET, accessToken, ACCESS);
    if (!payload || typeof payload['sid'] !== 'string' || typeof payload['uid'] !== 'string')
      return null;
    const session = await this.prisma.session.findUnique({
      where: { id: payload['sid'] },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        scopeCaseId: true,
        twoFactorVerifiedAt: true,
        user: {
          select: {
            id: true,
            role: true,
            status: true,
            deletedAt: true,
            twoFactorEnabled: true,
            emailVerifiedAt: true,
          },
        },
      },
    });
    if (!session || session.userId !== payload['uid']) return null;
    if (session.revokedAt || session.expiresAt <= new Date()) return null;
    if (session.user.status !== 'active' || session.user.deletedAt) return null;
    if (!session.lastUsedAt || Date.now() - session.lastUsedAt.getTime() > 60_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }
    return {
      actor: {
        userId: session.user.id,
        role: session.user.role,
        sessionId: session.id,
        scopeCaseId: session.scopeCaseId,
      },
      twoFactorVerified: session.twoFactorVerifiedAt !== null,
      user: {
        id: session.user.id,
        role: session.user.role,
        twoFactorEnabled: session.user.twoFactorEnabled,
        emailVerifiedAt: session.user.emailVerifiedAt,
      },
    };
  }

  /** The CSRF cookie belongs to this session. */
  isCsrfTokenFor(sessionId: string, token: string): boolean {
    return safeEqual(token, this.csrfTokenFor(sessionId));
  }

  /**
   * Swaps a refresh token for a new access token and a new refresh token. The old refresh token stops working. Presenting
   * an already-replaced refresh token (outside the grace period) means it was copied, so the whole session is revoked.
   */
  async refresh(cookie: string): Promise<RefreshOutcome> {
    const [sessionId, secret, extra] = cookie.split('.');
    if (!sessionId || !UUID.test(sessionId) || !secret || extra !== undefined) return { ok: false };
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        kind: true,
        userId: true,
        tokenHash: true,
        previousTokenHash: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.kind !== 'user')
      return { ok: false };
    if (session.user.status !== 'active' || session.user.deletedAt) return { ok: false };

    const presented = sha256Hex(secret);
    if (safeEqual(presented, session.tokenHash)) {
      const next = randomToken();
      const expiresAt = new Date(Date.now() + AUTH_LIMITS.refreshTokenDays * DAY_MS);
      // Only the request that still holds the current token wins; a concurrent one finds the hash already changed.
      const rotated = await this.prisma.session.updateMany({
        where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
        data: {
          tokenHash: sha256Hex(next),
          previousTokenHash: session.tokenHash,
          lastUsedAt: new Date(),
          expiresAt,
        },
      });
      if (rotated.count !== 1) return { ok: false };
      return {
        ok: true,
        userId: session.userId,
        result: {
          sessionId: session.id,
          tokens: this.tokensFor(session.id, session.userId, next, expiresAt),
        },
      };
    }
    if (session.previousTokenHash && safeEqual(presented, session.previousTokenHash)) {
      const rotatedAgo = session.lastUsedAt ? Date.now() - session.lastUsedAt.getTime() : Infinity;
      if (rotatedAgo <= ROTATION_GRACE_MS) return { ok: false };
      await this.revoke(this.prisma, session.id);
      return { ok: false, revokedUserId: session.userId };
    }
    return { ok: false };
  }

  revoke(db: Db, sessionId: string): Promise<Prisma.BatchPayload> {
    return db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every live session of a user, except `exceptSessionId` (the one making the request). */
  revokeAll(db: Db, userId: string, exceptSessionId?: string): Promise<Prisma.BatchPayload> {
    return db.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async list(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, kind: 'user' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceLabel: true, ip: true, createdAt: true, lastUsedAt: true },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
      current: s.id === currentSessionId,
    }));
  }
}
