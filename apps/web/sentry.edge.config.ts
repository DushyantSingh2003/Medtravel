import * as Sentry from '@sentry/nextjs';
import { nextSentryOptions } from '@medtravel/observability/next';

Sentry.init(nextSentryOptions('web', process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
