import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',

    // Vitest's default of five seconds is for a unit test. A test of the overlay reader can sweep a capture with tens of
    // Tesseract processes before it finds the numbers, which runs to tens of seconds on a two-core runner.
    testTimeout: 60_000,
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text'],
    },
  },
});
