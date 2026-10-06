import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own. Why, in `screens.test.mts`.
const CORPUS = '**/screens.test.mts';

const shared = { dir: 'src', testTimeout: 60_000 };

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text'],
    },
    projects: [
      { test: { ...shared, name: 'fast', exclude: [...defaultExclude, CORPUS] } },
      { test: { ...shared, name: 'corpus', include: [CORPUS] } },
    ],
  },
});
