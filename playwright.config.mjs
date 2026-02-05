/* eslint-env node */
// Playwright config with visual testing support
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    // Capture screenshots for all tests to enable visual comparisons
    screenshot: 'on',
    actionTimeout: 10000,
  },
  workers: process.env.CI ? '100%' : 1,
  retries: process.env.CI ? 2 : 0,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  reporter: [['list'], ['html']],
  // Configure snapshot directory for approved screenshots
  snapshotDir: './tests/e2e/snapshots',
  expect: {
    toMatchSnapshot: {
      threshold: 0.05,
    },
  },
  // Auto-start dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
