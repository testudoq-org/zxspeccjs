# Tests classification report

- tests/debug_boot_sequence.mjs — Playwright browser diagnostics. Moved to /tests-e2e/ and tagged with // @e2e @ui
- tests/debug_rom_loading.mjs — Playwright browser diagnostics. Moved to /tests-e2e/ and tagged with // @e2e @ui
- tests/debug_state_dump.spec.mjs — Playwright browser debug helper. Moved to /tests-e2e/ and tagged with // @e2e @ui
- tests/simple_instruction_test.mjs — Playwright browser test; Moved to /tests-e2e/ and tagged with // @e2e @ui
- tests/test_z80_ed_fallback.mjs — Vitest unit test for CPU stepping; kept in tests/ and labeled with // @unit
- tests/test_z80_new_ops.mjs — Vitest unit tests for Z80 opcodes; kept in tests/ and labeled with // @unit
- tests/test_z80_stack_and_ed_returns.mjs — Node-script style unit tests (not using a test framework). Recommend converting to vitest format or keeping as an internal node utility; label as // @unit if converted

Summary of actions performed:
- Moved Playwright/browser tests to /tests-e2e/ and added // @e2e @ui tags.
- Kept Vitest/unit tests in tests/ and recommended unit labeling.

Next steps (manual):
- Convert tests/test_z80_stack_and_ed_returns.mjs to Vitest format if you want it run by the unit test runner.

This report has been removed per your request.