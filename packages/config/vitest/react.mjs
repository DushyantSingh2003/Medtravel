import { defineConfig } from 'vitest/config';

/** Shared Vitest settings for React workspaces. */
export const reactTestConfig = {
  globals: true,
  environment: 'jsdom',
  passWithNoTests: true,
  include: ['src/**/*.{spec,test}.{ts,tsx}'],
};

export default defineConfig({ test: reactTestConfig });
