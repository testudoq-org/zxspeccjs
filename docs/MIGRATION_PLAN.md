# Migration Plan — tests / scripts cleanup

Goal: move diagnostic/debug/tests out of project root into the consolidated `tests/` tree (unit/integration/e2e/scripts), update `package.json` test scripts, and fix lint issues for ad-hoc scripts.

Summary actions

1. Create target directories:
   - `tests/unit` (unit tests)
   - `tests/integration` (integration tests)
   - `tests/e2e` (Playwright/browser tests)
   - `tests/scripts` (manual diagnostics, debug tools)

2. Use an idempotent PowerShell helper `scripts/migrate-tests.ps1` (in this repo). Workflow:
   - Dry-run: `.	ests\scripts\migrate-tests.ps1 -DryRun` (it outputs `move-plan.json`).
   - Review `move-plan.json` and adjust patterns if any file needs manual target.
   - Apply: `.	ests\scripts\migrate-tests.ps1 -ApplyEdits` (this will `git mv` files and optionally update `package.json` and `.eslintrc.cjs`).

Mapping rules (default)

- tests/unit: filenames matching `^test[_\-].*\.mjs`, `^test.*\.mjs` (fast tests named `test_*`).
- tests/e2e: files matching `^(boot|run_full_boot|run_boot).*\.mjs` and `comprehensive.*boot.*\.mjs` (browser boot tests).
- tests/scripts: files containing `diagnostic|debug|analysis|examine|trace|report|final|corrected|detailed` (diagnostics and ad-hoc scripts).
- Files that don’t match any pattern are flagged for manual review.

Lint fixes (recommended / automated):

- Add an ESLint override for `tests/scripts/**/*.mjs` setting `env: { node: true, browser: true }` and `rules: { 'no-console': 'off', 'no-undef': 'off' }`.
- Optionally add `/* eslint-env node */` or `/* eslint-disable no-console */` at top of specific script files if more granular control required.

Package.json updates (applied by script when `-ApplyEdits` is used):

- "test:unit": "vitest run --dir tests/unit"
- "test:integration": "vitest run --dir tests/integration"
- "test:e2e": "npx playwright test tests/e2e"
- "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e"
- "test:watch": "vitest --watch --dir tests/unit"

Safety & review

- The script writes `move-plan.json` for review before changing files.
- The script uses `git mv` so history is preserved.
- Always check commits and run full test suite and Codacy analysis after migration.

Manual follow-up checklist

- Move any misclassified file manually and commit.
- Run `npm run lint` or the equivalent and fix any remaining issues.
- Convert large ad-hoc scripts that should be integration/e2e tests into proper test harnesses (use Vitest or Playwright).

If you want, I can run the script with `-DryRun` and show the proposed plan now, or proceed to apply the migration with `-ApplyEdits` (I will commit and then run Codacy analysis and fix the ESLint override).