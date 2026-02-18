/* Temporary debug config for headed runs with extended action timeout */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'on',
    // increase action timeout for slower screenshot/font loads during debugging
    actionTimeout: 30000,
    // run headless to allow CI/debug runs while still recording video
    headless: true,
    // capture video to help diagnose failures
    video: 'on',
  },
  workers: 1,
  retries: 0,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  reporter: [['list'], ['html']],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: true,
    timeout: 30000,
  },
});