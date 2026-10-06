import { defaultExclude, defineConfig } from 'vitest/config';

// The capture corpus, which costs 95% of the suite and so runs on its own.
const CORPUS = '**/screens.test.mts';

/**
 * What anything that waits on one screenshot being read gets, which is the slowest thing in the suite by a long way and
 * the only reason either timeout below is not the default. A hook gets it as well as a test because `screens.test.mts`
 * tears its read-ahead pool down by waiting on the reads already in flight, a read not being abortable once Tesseract
 * has it.
 */
const CAPTURE_TIMEOUT = 60_000;

const shared = {
  dir: 'src',
  testTimeout: CAPTURE_TIMEOUT,
  hookTimeout: CAPTURE_TIMEOUT,
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
          exclude: [...defaultExclude, CORPUS],
        },
      },
    ],
  },
});
