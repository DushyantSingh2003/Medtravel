import { enterRequestId, REQUEST_ID_HEADER } from '@medtravel/observability';
import type { FastifyInstance } from 'fastify';

/** Puts the ID on the response and makes it available to code that never sees the request (jobs queued, error reports). */
export function registerRequestIdHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, String(request.id));
    enterRequestId(String(request.id));
    done();
  });
}
