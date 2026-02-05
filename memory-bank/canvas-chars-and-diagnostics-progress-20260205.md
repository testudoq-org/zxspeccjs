# Canvas / CHARS / Diagnostics — Progress Update

Date: 2026-02-05

Summary

This document records the recent work to make glyph rendering deterministic and robust, the debug surface and instrumentation added to observe CHARS writes, the deferred-frame rendering architecture, automated tests, and outstanding issues and next steps.

Scope of changes (high-level)

- Deterministic tracing around CHARS writes and subsequent memory writes (``recent-trace``) to capture ordered events: CHARS write -> char bitmap writes -> screen writes -> render.
- Added debug surface APIs: ``startRecentTrace``, ``getRecentTrace``, ``triggerTraceOnCharsWrite``, ``requestImmediateRender``, ``injectGlyphAndFreeze``, ``unfreezeCHARS``, and ``__TEST__`` fixtures for test visibility.
- Transitioned to deferred rendering architecture: ``FrameBuffer`` + ``FrameRenderer`` (FrameBuffer.generateFromMemory() used at end-of-frame to avoid mid-frame races and red line artifacts).
- Strengthened FrameBuffer backfill helpers to recover partially populated character cells from CHARS or ROM when required (``_tryBackfillCell`` / ``ensureBackfilledDisplayCell``).
- Implemented conservative auto-reveal mitigation (diagnostic-only, boot-scoped): temporarily override attributes and copy glyph bytes into display memory, then auto-restore after configurable timeout.
- Added a requestImmediateRender hook to trigger fast renders when recent-trace is active to mitigate race conditions where glyph writes are missed by the canvas updates.
- Fixed regressions introduced earlier: removed early display clearing and initial first-render clearing that caused red horizontal lines and erased boot text.
- Added an injectGlyphAndFreeze helper to test/force CHARS pointer and glyph bytes in RAM.

Files touched (not exhaustive)

- src/main.mjs — debug surface, deferred init, gatherDiag auto-reveal + diagnostics UI (Dump line diag), requestImmediateRender wiring, injectGlyphAndFreeze, ROM selector logging and auto-load wrapper.
- src/memory.mjs — on CHARS writes: start recent trace and call requestImmediateRender; on bitmap & screen writes: add recent-trace events and render triggers.
- src/ula.mjs — removed early display clearing; default to deferred rendering; first-render diagnostics safe-guarding.
- src/frameBuffer.mjs — added/strengthened backfill logic for all-zero cells.
- tests/glyph-trace.spec.mjs — Playwright e2e test asserting CHARS → charBitmap → screenBitmap → render sequence and canvas 8×8 pixel sampling to verify visual presence.
- tools/* — Node helpers for exercising watch APIs and PC tracing in headless runs.

Testing & CI

- Unit tests updated/added for input/keyboard and ULA behavior.
- New Playwright test (glyph-trace) added — requires a running dev server to execute E2E tests.
- Linting and minor build fixes applied (resolved browser global no-undef warnings).

Outstanding issues identified

- *ROM not appearing in the UI selector in some environments* — diagnostics logged that ``romManager.listRoms()`` reported an empty/partial registry during runtime in some user runs. Confirmed that the bundled ``spec48`` module exists in ``src/roms/spec48.js``. Added extra runtime logs in init path to capture registry state during auto-load; follow-up: add defensive fallback registration at runtime.
- *Partial red stripe persists for some users* — added "Dump line diag" to collect attribute/bitmap/frameBuffer samples for suspicious canvas rows; next: gather data from affected runs and correlate write history to see whether stripe is due to partial frame generation or attribute corruption.
- *Page hang on startup / navigation abort during Playwright runs* — tests failed in some CI runs due to auto-load timing or dev-server not available during run. Recommendation: ensure dev server is started in test job prior to Playwright run and add robust wait-for-emulator readiness hook.

Architecture notes

- Use deferred rendering as default (FrameBuffer + FrameRenderer) to prevent mid-frame race rendering artifacts and allow deterministic backfilling. Immediate rendering remains available for targeted diagnostics via ``requestImmediateRender``.
- Keep all fallbacks opt-in and test-scoped. Auto-reveal is intentionally conservative and boot-scoped (auto-restored) to avoid masking persistent bugs during normal operation.
- The CHARS pointer (0x5C36/0x5C37) is a critical signal. When CHARS changes from zero, we start trace windows and schedule targeted renders, and poll for glyph bytes to avoid rendering before ROM copies font bytes.

Next actions (priority)

1. Collect "Dump line diag" artifacts from failing user runs and attach to a triage issue. Use the gathered attribute/bitmap/frameBuffer samples to correlate with memWrites history to find the origin of the stripe.
2. Add a small runtime fallback to ensure the bundled `spec48` is visible in the ROM selector when the registry is unexpectedly empty (log + register at DOM ready). Keep fallback non-invasive and test-gated.
3. Stabilize Playwright runs by adding a dev-server start step in test CI and waiting for emulator readiness (``window.emulator`` + a recently-added readiness hook) before running tests.
4. Add a Playwright test that reproduces the missing-7F case and asserts the auto-reveal + restore flow (regression protection).
5. If stripe persists after diagnostics, add a conservative render-time copy of missing glyphs when frame generation sees all-zero rows for printable chars prior to boot completion.

Acceptance / Merge notes

- Branch: feature-improve-interaction-with-canvas-emulation
- Testing expected before merge: unit tests pass locally; run Playwright glyph-trace after starting dev server.
- After merge: create follow-up issues for unresolved items (ROM selector fallback, stripe triage, Playwright test flakiness).

Appendix: quick commands

- Run unit tests:

```bash
npm test
# or npx vitest
```

- Run Playwright test (requires dev server):

```bash
# in one terminal
npm run dev
# in another
npx playwright test tests/glyph-trace.spec.mjs
```

---

If you'd like, I can now commit this file to the current branch, push it, create a PR using the GitHub CLI, and merge it after we confirm CI checks. Please confirm and I'll proceed to create the commit and PR.