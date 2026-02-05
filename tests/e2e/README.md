# Playwright E2E tests (tests/e2e)

This folder contains Playwright end-to-end tests for the ZX Spectrum emulator.

Quick commands:

- Run all E2E tests: ```npm run test:e2e``` (uses `npx playwright test tests/e2e`)
- List tests (dry-run): ```npx playwright test --list```
- Run specific test: ```npx playwright test tests/e2e/keyboard-screenshot.spec.mjs -g "keyboard screenshot"```
- Artifacts & snapshots:
  - Screenshots & artifacts: `tests/e2e/_artifacts/`
  - Approved snapshots: `tests/e2e/snapshots/`

Notes:
- Playwright config (`playwright.config.mjs`) points at `tests/e2e` and snapshotDir is `./tests/e2e/snapshots`.
- Vitest is configured to exclude `tests/e2e/**` so unit runs won't pick up E2E specs.
- If you have references to `tests-e2e/` (dash style), update them to `tests/e2e/`. A short-lived compatibility stub exists at `tests-e2e/README.md`.