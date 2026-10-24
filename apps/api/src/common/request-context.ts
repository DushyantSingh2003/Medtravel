import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../auth/actor.js';

/** What a service needs to know about the request to write an audit row. Never carries a body or a token. */
export interface RequestContext {
  /** Null on the public routes (sign-in, password reset) where nobody is signed in yet. */
  actor: Actor | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export const contextOf = (request: FastifyRequest): RequestContext => {
  const userAgent = request.headers['user-agent'];
  return {
    actor: request.actor ?? null,
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    requestId: String(request.id),
  };
};

export const Ctx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext =>
    contextOf(context.switchToHttp().getRequest<FastifyRequest>()),
);
