import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own.
const CORPUS = '**/screens.test.mts';

/**
 * What a `corpus` test gets instead of the 60s below, because a test there waits on one screenshot being read and that
 * read competes with the others the file keeps in flight — 30.3s for the costliest capture on four cores against 8.4s
 * read on its own. `CONTENDED_CAPTURE_TIMEOUT` in `screens.test.mts` is the same figure and carries the measurements
 * behind it; the two are a pair.
 */
const CORPUS_TIMEOUT = 120_000;

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
          testTimeout: CORPUS_TIMEOUT,
        },
      },
      {
        test: {
          ...shared,
          name: 'default',
          exclude: [...defaultExclude, CORPUS],
        },
      },
    ],
  },
});
