import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requiresTwoFactor, type Role } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, readCookie } from './cookies.js';
import { LIMITED_KEY, ALLOW_MAGIC_LINK_KEY, PUBLIC_KEY, WS_GATEWAY_KEY } from './decorators.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Whether the mandatory second factor is switched on: always, except for local development with the skip flag. */
export const twoFactorEnforced = (env: Env): boolean =>
  !(env.NODE_ENV === 'development' && env.AUTH_DEV_SKIP_2FA);

/**
 * Whether a session still owes its second factor (it can then use only the set-up page): shared by the HTTP guard and the
 * realtime gateway so the two cannot drift apart.
 */
export function secondFactorOwed(
  auth: {
    twoFactorVerified: boolean;
    actor: { scopeCaseId: string | null };
    user: { role: Role; twoFactorEnabled: boolean };
  },
  env: Env,
): boolean {
  return (
    auth.actor.scopeCaseId === null &&
    !auth.twoFactorVerified &&
    ((requiresTwoFactor(auth.user.role) && twoFactorEnforced(env)) || auth.user.twoFactorEnabled)
  );
}

/**
 * Who is calling? Reads the access token (cookie, or `Authorization: Bearer`), checks the session behind it, and
 * attaches the actor to the request. Also the cross-site request protections: an unsafe request must come from an
 * allowed origin, and a cookie-authenticated one must carry the CSRF token. Public routes skip authentication only.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A WebSocket connection is authenticated once, when it connects, by the gateway itself; only a class that says so
    // (`@WsGateway()`) is let through. Any other non-HTTP handler (a future microservice or gateway) is refused until it is
    // given its own authentication.
    if (context.getType() !== 'http') {
      return this.reflector.get<boolean>(WS_GATEWAY_KEY, context.getClass()) === true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const unsafe = !SAFE_METHODS.has(request.method);

    const origin = request.headers.origin;
    if (unsafe && typeof origin === 'string' && !this.env.CORS_ORIGINS.includes(origin)) {
      throw new ForbiddenException('This request does not come from an allowed origin');
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const bearer = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    const cookieToken = readCookie(request.headers.cookie, ACCESS_COOKIE);
    const token = bearer ?? cookieToken;
    const auth = token ? await this.sessions.authenticate(token) : null;
    if (!auth) {
      // `session_expired` tells the browser client that a refresh is worth trying; other 401s (a wrong password) are final.
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Sign in to continue',
        error: 'Unauthorized',
        code: 'session_expired',
      });
    }

    // A bearer token is not sent by the browser on its own, so only cookie sessions need the CSRF token.
    if (!bearer && unsafe) {
      const header = request.headers[CSRF_HEADER];
      const cookie = readCookie(request.headers.cookie, CSRF_COOKIE);
      if (
        typeof header !== 'string' ||
        header !== cookie ||
        !this.sessions.isCsrfTokenFor(auth.actor.sessionId, header)
      ) {
        throw new ForbiddenException('Missing or invalid CSRF token');
      }
    }

    const magicLink = auth.actor.scopeCaseId !== null;
    // A one-case session may use only the routes that opt in and know how to keep to that case.
    if (magicLink && !this.reflector.getAllAndOverride<boolean>(ALLOW_MAGIC_LINK_KEY, targets)) {
      throw new ForbiddenException('This link only opens one case');
    }

    const owed = secondFactorOwed(auth, this.env);
    if (owed && !this.reflector.getAllAndOverride<boolean>(LIMITED_KEY, targets)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Finish setting up two-factor authentication to continue',
        code: 'two_factor_required',
      });
    }
    request.actor = auth.actor;
    request.limitedSession = owed;
    return true;
  }
}
