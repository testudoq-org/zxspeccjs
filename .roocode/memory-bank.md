## Additional Quality, Test & Codacy Enforcement Rules (Appended 2026-02-06)

- **Mandatory pre-commit reminder (must appear in every suggestion):**  
  "Before committing, run: npm run test:unit && npx playwright test tests/e2e --grep @smoke && codacy-analysis-cli analyze --upload"

- **Do not introduce regressions:**  
  - Never suggest code that would knowingly break existing passing unit tests, E2E tests, or trigger Codacy issues (security, duplication, complexity).  
  - Always verify tests locally before pushing.

- **Test-first workflow:**  
  - Propose failing test(s) first (Vitest for unit/integration; Playwright for E2E), then the minimal code required to make them pass.  
  - For logic changes, include a **"Tests to add"** section listing specific Vitest or Playwright specs to add (file name, brief description, and expected failing assertion).

- **When touching critical files (must be explicit):**  
  - If modifying `z80.mjs`, `ula.mjs`, `memory.mjs`, `frameBuffer.mjs`, `input.mjs`, or any rendering/input logic:  
    - Propose matching Vitest unit/integration tests and, if appropriate, Playwright E2E scenarios.  
    - Mention likely Codacy flags (e.g., cognitive complexity, magic numbers, security hotspots) and suggest mitigations.

- **Tools & scope guidance:**  
  - Prefer **Vitest** for isolated logic (Z80 opcodes, flags, ULA port reads with row mask, backfill).  
  - Use **Playwright E2E** for full-system behavior (boot success, keyboard → canvas text, © glyph visibility, status updates).  
  - End every suggestion with:  
    "Verify locally with: npm run test:unit && npx playwright test tests/e2e/boot*.spec.mjs tests/e2e/glyph*.spec.mjs && codacy-analysis-cli analyze --upload"

- **Commit & PR practices:**  
  - Suggest small, focused commits with clear messages, e.g.:  
    - `fix: ULA readPort row mask handling`  
    - `test: add Z80 ED prefix coverage`  
  - Before suggesting a commit, remind: "Run full unit suite + fast E2E subset + Codacy local scan locally first".  
  - For PRs to `main`: require passing GitHub Actions (unit + full E2E), SonarCloud quality gate, **and Codacy status** before merge.

- **Quality & static analysis priorities:**  
  - Prioritize coverage for low-coverage files: **`z80.mjs` (~49–53%), `ula.mjs` (~53%), `memory.mjs` (~54%)**.  
  - Flag potential SonarLint/SonarCloud/Codacy issues: high complexity, magic numbers, missing strict equality (`===`), security hotspots, duplicated code. Suggest concrete fixes (refactor, constants, smaller functions).

- **Hardware & domain-specific constraints:**  
  - Z80 behavior must match real hardware: flags (including undocumented bits 3/5), timing, prefix handling (DD/FD/ED/CB).  
  - ULA keyboard reads must use full 16-bit address (row mask = `addr >> 8`).  
  - Canvas rendering must be pixel-perfect (320×240 with borders) and correct **ink/paper/bright** mapping.  
  - Never break boot sequence or © glyph visibility.

- **Design & style:**  
  - Prefer testable patterns: pure functions, small methods, clear inputs/outputs.  
  - Keep suggestions concise, bulleted, and professional. Always include a **"Tests to add"** section for logic changes.

- **Final enforcement note:**  
  - All suggestions must explicitly mention potential Codacy and SonarCloud flags where relevant, include the mandatory pre-commit reminder (above), and end with the "Verify locally with: ..." line.

Always verify with unit tests, fast E2E subset, and Codacy local scan before commit.