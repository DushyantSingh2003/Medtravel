import { defineConfig } from 'orval';

/**
 * Generates a typed client and TanStack Query hooks from the API's OpenAPI document.
 *
 * The document is written by `pnpm --filter @medtravel/api openapi:export`, which boots the
 * Nest application without listening and dumps the Swagger JSON. `pnpm api:generate` at the
 * repo root runs both steps. Generated output is gitignored and never edited by hand.
 */
export default defineConfig({
  medtravel: {
    input: { target: '../../apps/api/openapi.json' },
    output: {
      mode: 'tags-split',
      target: './generated/endpoints',
      schemas: './generated/model',
      client: 'react-query',
      prettier: true,
      override: {
        mutator: { path: './src/fetcher.ts', name: 'apiFetcher' },
        query: { signal: true },
      },
    },
  },
});
