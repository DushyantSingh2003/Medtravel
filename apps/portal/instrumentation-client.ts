import * as Sentry from '@sentry/nextjs';
import { nextSentryOptions } from '@medtravel/observability/next';

// Read as the literal `process.env.NEXT_PUBLIC_X` so Next inlines it into the browser bundle.
Sentry.init(nextSentryOptions('portal', process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
