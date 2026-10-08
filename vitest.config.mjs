import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own.
const CORPUS = '**/screens.test.mts';

/**
 * What the `corpus` project gets instead of the 60s below: anything waiting there waits on one screenshot being read,
 * and that read competes with the others the file keeps in flight — 30.3s for the costliest capture on four cores
 * against 8.4s read on its own. A timeout is here to catch a read that has hung, not to hold a contended one to time.
 *
 * It covers the hooks as well as the tests, which is what `screens.test.mts` needs for the read-ahead pool it tears
 * down by waiting. On the project rather than in `shared`, which keeps it off `default`. `READ_AHEAD` in that file is
 * where the measurements live.
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
          hookTimeout: CORPUS_TIMEOUT,
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
