import { fileURLToPath } from 'node:url';
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
  transpilePackages: ['@medtravel/ui', '@medtravel/api-client', '@medtravel/i18n'],
  turbopack: {
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default withNextIntl(nextConfig);
