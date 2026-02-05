import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.mjs', 'tests/**/*.test.mjs', 'tests/**/*.spec.mjs'],
    exclude: ['tests/*.mjs', 'tests/scripts/**', 'tests/e2e/**', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    threads: false,
  },
});
