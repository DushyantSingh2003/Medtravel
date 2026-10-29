import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** Worker tests against a real database: migrations applied to a throwaway database on the server named by DATABASE_URL. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
