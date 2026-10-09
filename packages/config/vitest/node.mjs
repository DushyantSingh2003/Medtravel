import { defineConfig } from 'vitest/config';

/** Shared Vitest settings for Node-side workspaces (API, worker, packages). */
export const nodeTestConfig = {
  globals: true,
  environment: 'node',
  passWithNoTests: true,
  include: ['src/**/*.{spec,test}.ts'],
};

export default defineConfig({ test: nodeTestConfig });
