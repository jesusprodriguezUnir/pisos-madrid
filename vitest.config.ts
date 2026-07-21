import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    coverage: {
      include: ['src/app/core/**/*.ts', 'scripts/**/*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
