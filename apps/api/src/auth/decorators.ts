import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionAction, PermissionSubject } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from './actor.js';

export const PUBLIC_KEY = 'auth:public';
export const AUTHENTICATED_KEY = 'auth:authenticated';
export const PERMISSION_KEY = 'auth:permission';
export const LIMITED_KEY = 'auth:limited-session';
export const NO_MAGIC_LINK_KEY = 'auth:no-magic-link';
export const THROTTLE_KEY = 'auth:throttle';

export interface RequiredPermission {
  action: PermissionAction;
  subject: PermissionSubject;
}

/** The route needs no sign-in (health checks, the sign-in endpoints themselves). Use sparingly. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Any signed-in user may call the route: their own profile, sessions and security settings. */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/**
 * Declares the permission a route needs. Every route must have one, or be `@Public()` or `@Authenticated()`; a route
 * with none is refused, so a forgotten decorator fails closed.
 */
export const Can = (action: PermissionAction, subject: PermissionSubject) =>
  SetMetadata(PERMISSION_KEY, { action, subject } satisfies RequiredPermission);

/**
 * The route may be used by a session that has not completed two-factor yet: the 2FA setup itself, `me` and logout.
 * Every other route refuses such a session, which is how staff are kept from skipping 2FA.
 */
export const AllowLimitedSession = () => SetMetadata(LIMITED_KEY, true);

/** A magic-link session (one doctor, one case) may not use this route: account, 2FA and invitation endpoints. */
export const NoMagicLink = () => SetMetadata(NO_MAGIC_LINK_KEY, true);

export interface ThrottleOptions {
  limit: number;
  windowSeconds: number;
}

/** At most `limit` calls per `windowSeconds` from one address to this route. */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);

/** The signed-in actor. Only available on routes that are not `@Public()`. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!actor) throw new Error('CurrentActor used on a route without authentication');
    return actor;
  },
);
