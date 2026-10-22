import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { requiresTwoFactor } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, readCookie } from './cookies.js';
import { LIMITED_KEY, NO_MAGIC_LINK_KEY, PUBLIC_KEY } from './decorators.js';
import { SessionService } from './session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Whether the mandatory second factor is switched on: always, except for local development with the skip flag. */
export const twoFactorEnforced = (env: Env): boolean =>
  !(env.NODE_ENV === 'development' && env.AUTH_DEV_SKIP_2FA);

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
    if (!auth) throw new UnauthorizedException('Sign in to continue');

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
    if (magicLink && this.reflector.getAllAndOverride<boolean>(NO_MAGIC_LINK_KEY, targets)) {
      throw new ForbiddenException('This link only opens one case');
    }

    const secondFactorOwed =
      !magicLink &&
      !auth.twoFactorVerified &&
      ((requiresTwoFactor(auth.user.role) && twoFactorEnforced(this.env)) ||
        auth.user.twoFactorEnabled);
    if (secondFactorOwed && !this.reflector.getAllAndOverride<boolean>(LIMITED_KEY, targets)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Finish setting up two-factor authentication to continue',
        code: 'two_factor_required',
      });
    }
    request.actor = auth.actor;
    request.limitedSession = secondFactorOwed;
    return true;
  }
}
