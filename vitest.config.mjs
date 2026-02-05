import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.mjs', 'test/**/*.test.mjs', 'tests/**/*.spec.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    threads: false,
  },
});
