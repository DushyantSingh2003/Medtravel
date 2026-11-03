import { REQUEST_ID_HEADER } from '@medtravel/observability';
import type { FastifyInstance } from 'fastify';

/** Puts the request's ID on the response. (The async context is set by the middleware in the module, scoped to the request.) */
export function registerRequestIdHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, String(request.id));
    done();
  });
}
