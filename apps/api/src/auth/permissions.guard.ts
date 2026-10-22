import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can } from '@medtravel/contracts';
import type { FastifyRequest } from 'fastify';
import { PERMISSION_KEY, PUBLIC_KEY, type RequiredPermission } from './decorators.js';

/**
 * Checks the `@Can(action, subject)` of the route against the actor's role. A route that declares no permission
 * and is not public is refused: forgetting the decorator must never open an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    const actor = context.switchToHttp().getRequest<FastifyRequest>().actor;
    if (!required || !actor || !can(actor.role, required.action, required.subject)) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
