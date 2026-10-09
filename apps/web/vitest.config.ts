import { defineConfig } from 'vitest/config';

/**
 * Component tests live next to the components they cover. There are none yet — the first
 * arrive with the screens in F-01 onward — so the run passes on an empty suite rather than
 * failing the whole `pnpm check`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: ['{app,components,lib}/**/*.{spec,test}.{ts,tsx}'],
  },
});
