import { test, expect } from 'vitest';

// CI-safety check: ensure ALLOW_SYNTHETIC_INJECTION is never set in CI runs.
// This test is skipped locally and only enforces the rule when running in CI.
test.skipIf(!process.env.CI)('CI must not set ALLOW_SYNTHETIC_INJECTION', () => {
  expect(process.env.ALLOW_SYNTHETIC_INJECTION).toBeUndefined();
});
