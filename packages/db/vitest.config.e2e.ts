import { defineConfig } from 'vitest/config';

/**
 * Database tests: apply the migrations to a throwaway database on the server named by DATABASE_URL and
 * check the schema with real SQL. Needs PostgreSQL 16 and a role that may create databases.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
