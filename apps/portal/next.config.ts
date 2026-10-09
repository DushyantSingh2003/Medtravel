import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
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
