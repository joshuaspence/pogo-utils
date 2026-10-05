import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    testTimeout: 60_000,
    coverage: {
      enabled: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text'],
    },
  },
});
