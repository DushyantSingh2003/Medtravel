import { scrubBreadcrumb, scrubEvent } from './scrub.js';

/**
 * The Sentry settings the website and the portal share, browser and server alike. No traces (the load is not worth the cost
 * yet), and everything passes through the same scrubbing as the API before it leaves.
 */
export function nextSentryOptions(service: 'web' | 'portal', dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    release: process.env['SENTRY_RELEASE'],
    tracesSampler: () => 0,
    beforeSendTransaction: () => null,
    initialScope: { tags: { service } },
    beforeSend: <T extends object>(event: T): T => scrubEvent(event),
    beforeBreadcrumb: <T extends object>(breadcrumb: T): T => scrubBreadcrumb(breadcrumb),
  };
}
