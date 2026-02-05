import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/test_*.mjs', 'tests/unit/**/*.test.mjs', 'tests/unit/**/*.spec.mjs'],
    exclude: ['tests/*.mjs', 'tests/scripts/**', 'tests/e2e/**', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    threads: false,
  },
});
