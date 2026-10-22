import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionAction, PermissionSubject } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from './actor.js';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSION_KEY = 'auth:permission';

export interface RequiredPermission {
  action: PermissionAction;
  subject: PermissionSubject;
}

/** The route needs no sign-in (health checks, public site data). Use sparingly. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Declares the permission a route needs. Every route must have one (or be `@Public()`); a route with neither is
 * refused, so a forgotten decorator fails closed.
 */
export const Can = (action: PermissionAction, subject: PermissionSubject) =>
  SetMetadata(PERMISSION_KEY, { action, subject } satisfies RequiredPermission);

/** The signed-in actor. Only available on routes that are not `@Public()`. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!actor) throw new Error('CurrentActor used on a route without authentication');
    return actor;
  },
);
