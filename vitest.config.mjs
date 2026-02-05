import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/*.mjs', 'tests/**/*.test.mjs', 'tests/**/*.spec.mjs', 'tests/unit/**/*.test.mjs'],
    exclude: ['tests/scripts/**', 'tests/e2e/**', 'tests/unit/wrapper-legacy-tests.test.mjs', 'tests/unit/test_*.mjs', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    threads: false,
  },

});
