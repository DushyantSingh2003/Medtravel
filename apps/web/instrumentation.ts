import * as Sentry from '@sentry/nextjs';

/** Starts error reporting for the server and edge runtimes; reports the errors Next catches while rendering a request. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

export const onRequestError = Sentry.captureRequestError;
