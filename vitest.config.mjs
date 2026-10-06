import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own.
const CORPUS = '**/screens.test.mts';

const shared = {
  dir: 'src',
  testTimeout: 60_000,
};

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text'],
    },
    projects: [
      {
        test: {
          ...shared,
          name: 'corpus',
          include: [CORPUS],
        },
      },
      {
        test: {
          ...shared,
          name: 'default',
          exclude: [...defaultExclude, CORPUS]
        }
      },
    ],
  },
});
