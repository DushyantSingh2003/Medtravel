import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { THROTTLE_KEY, type ThrottleOptions } from './decorators.js';
import { RateLimiter } from './rate-limiter.js';

/** Applies `@Throttle` to a route: limits calls per client address. Runs before authentication, so it also covers sign-in. */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    this.limiter.consume(
      `route:${request.method}:${request.routeOptions.url}:${request.ip}`,
      options.limit,
      options.windowSeconds,
    );
    return true;
  }
}
