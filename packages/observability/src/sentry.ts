import * as Sentry from '@sentry/node';
import { currentRequestId } from './request-id.js';
import { scrubBreadcrumb, scrubEvent } from './scrub.js';

export interface SentryOptions {
  /** Without a DSN nothing is sent and nothing is installed. */
  dsn?: string | undefined;
  service: 'api' | 'worker';
  environment: string;
  /** The release: the commit the build came from, so source maps and regressions line up. */
  release?: string | undefined;
  /** A different transport, for tests that capture what would be sent. */
  transport?: Sentry.NodeOptions['transport'];
}

/** Starts error reporting. Personal data is removed in `beforeSend` (and the SDK sends none by default). */
export function initSentry(options: SentryOptions): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    tracesSampleRate: 0,
    initialScope: { tags: { service: options.service } },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return true;
}

export interface CaptureContext {
  requestId?: string | undefined;
  /** The route pattern ("/cases/:id"), never the address with real ids in it. */
  route?: string | undefined;
  userId?: string | undefined;
  jobType?: string | undefined;
}

/** Reports an error with the request ID (the one given, or the one the code is running under). */
export function captureError(error: unknown, context: CaptureContext = {}): void {
  const requestId = context.requestId ?? currentRequestId();
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag('request_id', requestId);
    if (context.route) scope.setTag('route', context.route);
    if (context.jobType) scope.setTag('job_type', context.jobType);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(error);
  });
}

/** Sends what is queued and waits, for shutdown and tests. */
export const flushSentry = (timeoutMs = 2000): Promise<boolean> => Sentry.flush(timeoutMs);
