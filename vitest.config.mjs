import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own.
const CORPUS = '**/screens.test.mts';

/**
 * What the `corpus` project gets instead of the 60s below, because anything waiting there is waiting on one screenshot
 * being read, and that read competes with the others the file keeps in flight — 30.3s for the costliest capture on four
 * cores against 8.4s read on its own, so 60s was a margin for a slow runner to lose rather than a budget. A timeout is
 * here to catch a read that has hung, not to hold a contended one to time.
 *
 * It covers the hooks as well as the tests, which is the whole of what `screens.test.mts` needs for the read-ahead pool
 * it tears down by waiting on the reads in flight. Being on the project rather than in `shared` is what keeps it off
 * `default`, and the project matches that one file, so this reaches exactly the hooks it was raised for.
 *
 * `READ_AHEAD` in that file is where the measurements live.
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
