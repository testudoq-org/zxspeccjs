# Tests classification report

- tests/boot.test.mjs — Playwright browser tests (uses @playwright/test). Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/debug_boot_sequence.mjs — Playwright browser diagnostics. Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/debug_rom_loading.mjs — Playwright browser diagnostics. Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/debug_state_dump.spec.mjs — Playwright browser debug helper. Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/memory_debug_test.mjs — Playwright browser test that exercises in-page memory; Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/simple_instruction_test.mjs — Playwright browser test; Recommend: move to /tests-e2e/ and tag with // @e2e @ui
- tests/test_z80_ed_fallback.mjs — Vitest unit test for CPU stepping; Recommend: keep in unit tests and tag with // @unit
- tests/test_z80_new_ops.mjs — Vitest unit tests for Z80 opcodes; Recommend: keep in unit tests and tag with // @unit
- tests/test_z80_stack_and_ed_returns.mjs — Node-script style unit tests (not using a test framework). Recommend: convert to vitest format or keep as a node utility; tag as // @unit if converted

Summary:
- Files to move to /tests-e2e/: boot.test.mjs, debug_boot_sequence.mjs, debug_rom_loading.mjs, debug_state_dump.spec.mjs, memory_debug_test.mjs, simple_instruction_test.mjs
- Files to keep in tests/ as unit tests: test_z80_ed_fallback.mjs, test_z80_new_ops.mjs, test_z80_stack_and_ed_returns.mjs (convert to framework)

All classifications are based on whether the file imports from @playwright/test (browser/page interaction) versus vitest or bare CPU/memory logic (unit).