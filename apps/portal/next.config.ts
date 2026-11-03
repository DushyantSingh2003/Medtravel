import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs/config';
import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // The container image runs the standalone server (NEXT_OUTPUT=standalone is set in the
  // Dockerfile). Locally `next dev` / `next start` are unaffected.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        // In a monorepo, trace files from the repository root so workspace packages are included.
        outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
      }
    : {}),
  // Workspace packages ship TypeScript/JSX, so Next must compile them rather than
  // treat them as prebuilt node_modules.
  transpilePackages: [
    '@medtravel/ui',
    '@medtravel/api-client',
    '@medtravel/i18n',
    '@medtravel/observability',
  ],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

const withIntl = withNextIntl(nextConfig);

// Source maps are uploaded (and then removed from the build output) only when a Sentry auth token is present, i.e. in the release
// build. Everywhere else the config is plain, so a build without Sentry credentials works.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_PORTAL,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE },
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      silent: true,
      telemetry: false,
    })
  : withIntl;
