import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@medtravel/db';
import { IMPERSONATION_MINUTES, type Role } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { PRISMA } from '../database/database.module.js';
import { signToken, verifyToken } from '../modules/auth/crypto/signed-token.js';
import type { Actor } from './actor.js';
import { IMPERSONATION_COOKIE, readCookie } from './cookies.js';
import type { AuthenticatedSession } from './session.service.js';

const TYP = 'impersonation';

export interface ActiveImpersonation {
  /** The acting user for this request: the person being looked at. */
  actor: Actor;
  by: string;
  expiresAt: string;
}

/**
 * A super admin looking at the product as another user. The proof is a signed cookie tied to the admin's own session, so it
 * dies with that session and cannot be used by anyone else. While it is valid the guard makes the target the acting user,
 * read-only; every request is recorded in the audit trail against the admin.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A cookie value for `adminId`'s session `sessionId` to view `targetId`, and when it ends. */
  issue(
    adminId: string,
    sessionId: string,
    targetId: string,
  ): { token: string; expiresAt: Date; maxAgeSeconds: number } {
    const maxAgeSeconds = IMPERSONATION_MINUTES * 60;
    const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
    return {
      token: signToken(this.env.AUTH_TOKEN_SECRET, {
        typ: TYP,
        exp,
        aid: adminId,
        sid: sessionId,
        uid: targetId,
      }),
      expiresAt: new Date(exp * 1000),
      maxAgeSeconds,
    };
  }

  /**
   * The impersonation this request carries, or null. A cookie that is invalid, expired, from another session, or whose owner is
   * no longer a super admin is ignored, as is one whose target has since been deactivated or deleted.
   */
  async resolve(
    request: FastifyRequest,
    auth: AuthenticatedSession,
  ): Promise<ActiveImpersonation | null> {
    const cookie = readCookie(request.headers.cookie, IMPERSONATION_COOKIE);
    if (!cookie || auth.user.role !== 'super_admin' || auth.actor.scopeCaseId !== null) return null;
    const payload = verifyToken(this.env.AUTH_TOKEN_SECRET, cookie, TYP);
    if (!payload || payload['aid'] !== auth.user.id || payload['sid'] !== auth.actor.sessionId)
      return null;
    const target = await this.prisma.user.findFirst({
      where: {
        id: String(payload['uid']),
        status: 'active',
        deletedAt: null,
        role: { not: 'super_admin' },
      },
      select: { id: true, role: true },
    });
    if (!target) return null;
    return {
      actor: {
        userId: target.id,
        role: target.role as Role,
        sessionId: auth.actor.sessionId,
        scopeCaseId: null,
        impersonatorId: auth.user.id,
      },
      by: auth.user.id,
      expiresAt: new Date(Number(payload.exp) * 1000).toISOString(),
    };
  }

  /** One audit row per request made while impersonating: what was asked (method and route pattern), never the address or body. */
  async recordRequest(request: FastifyRequest, active: ActiveImpersonation): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorId: active.by,
        actorRole: 'super_admin',
        onBehalfOfId: active.actor.userId,
        action: 'impersonation.request',
        entityType: 'User',
        entityId: active.actor.userId,
        after: { method: request.method, route: request.routeOptions?.url ?? 'unmatched' },
        ip: request.ip ?? null,
        userAgent:
          typeof request.headers['user-agent'] === 'string'
            ? request.headers['user-agent'].slice(0, 512)
            : null,
        requestId: String(request.id),
      },
    });
  }
}
