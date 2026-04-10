import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/*.mjs', 'tests/**/*.test.mjs', 'tests/**/*.spec.mjs', 'tests/unit/**/*.test.mjs'],
    exclude: ['tests/scripts/**', 'tests/e2e/**', 'tests/unit/wrapper-legacy-tests.test.mjs', 'tests/unit/virtual-keyboard.test.mjs', 'tests/unit/ui-keyword.test.mjs', 'tests/unit/test_*.mjs', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Run test files sequentially (maxForks: 1) and give each fork 4GB heap to
    // prevent OOM crashes when loading large trace JSON files.
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        execArgv: ['--max-old-space-size=4096'],
      },
    },
  },

});
