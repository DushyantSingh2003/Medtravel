import { FastifyAdapter } from '@nestjs/platform-fastify';
import { acceptRequestId, REQUEST_ID_HEADER } from '@medtravel/observability';

/**
 * The HTTP server: every request gets an ID, the caller's `X-Request-Id` when it looks like one, otherwise a new one. It is
 * the same ID in the logs, the audit rows, the response header and error reports. Shared by `main.ts` and the test app.
 */
export function createFastifyAdapter(options: { trustProxyHops?: number } = {}): FastifyAdapter {
  const hops = options.trustProxyHops;
  return new FastifyAdapter({
    ...(hops === undefined ? {} : { trustProxy: (_address: string, hop: number) => hop < hops }),
    bodyLimit: 10 * 1024 * 1024,
    requestIdHeader: false,
    genReqId: (request: { headers: Record<string, string | string[] | undefined> }) =>
      acceptRequestId(request.headers[REQUEST_ID_HEADER]),
  });
}
