import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import {
  AUTHENTICATED_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
  type RequiredPermission,
} from './decorators.js';

/**
 * Checks what the signed-in actor may do. A route must be `@Public()`, `@Authenticated()` (any signed-in user), or
 * declare `@Can(action, subject)` that the actor's role satisfies. A route with none of these is refused: forgetting
 * the decorator must never open an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // WebSocket messages are checked by the gateway against the room a socket has joined.
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;

    // A declared permission is always checked, even under a class-level @Public() or @Authenticated() that would
    // otherwise wave every handler through.
    if (required) {
      if (!actor || !can(actor.role, required.action, required.subject)) {
        throw new ForbiddenException('You do not have permission to do this');
      }
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (actor && this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets)) return true;
    throw new ForbiddenException('You do not have permission to do this');
  }
}
