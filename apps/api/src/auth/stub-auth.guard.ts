import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleSchema } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import type { Actor } from './actor.js';
import { PUBLIC_KEY } from './decorators.js';

/** Cookie the portal's stub login sets (apps/portal/lib/auth/session-cookie.ts). Cookies are shared across ports. */
export const STUB_SESSION_COOKIE = 'mt_stub_session';
export const STUB_ROLE_HEADER = 'x-stub-role';

/** The value of one cookie in a `Cookie` header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name)
      return part.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * Development stand-in for authentication, replaced by F-03. When `ENABLE_STUB_AUTH` is on, the caller's role is
 * the `x-stub-role` header or the portal's stub cookie; when it is off, no request is ever authenticated.
 */
@Injectable()
export class StubAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const actor = this.env.ENABLE_STUB_AUTH ? this.actorOf(request) : null;
    if (!actor) throw new UnauthorizedException('Sign in to continue');
    request.actor = actor;
    return true;
  }

  private actorOf(request: FastifyRequest): Actor | null {
    const header = request.headers[STUB_ROLE_HEADER];
    const claimed =
      typeof header === 'string' ? header : readCookie(request.headers.cookie, STUB_SESSION_COOKIE);
    const role = roleSchema.safeParse(claimed);
    return role.success ? { userId: null, role: role.data } : null;
  }
}
