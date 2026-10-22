import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../auth/actor.js';

/** What a service needs to know about the request to write an audit row. Never carries a body or a token. */
export interface RequestContext {
  actor: Actor;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const Ctx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!request.actor) throw new Error('Ctx used on a route without authentication');
    const userAgent = request.headers['user-agent'];
    return {
      actor: request.actor,
      ip: request.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
      requestId: String(request.id),
    };
  },
);
