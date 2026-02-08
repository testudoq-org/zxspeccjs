# Active Context

Tracks current status, recent changes, and open questions for the ZX Spectrum emulator project.

---

## 2026-02-08 — Z80 Snapshot Parser Rewrite & Jetpac E2E Test

### Current Focus
- **Z80 PARSER COMPLETELY REWRITTEN**: Full V1/V2/V3 support with RLE decompression, correct header offsets, paged memory blocks
- **JETPAC CONFIRMED WORKING**: .z80 snapshots from Archive.org now load and run correctly
- **E2E JETPAC TEST ADDED**: Dedicated Playwright test for the exact Tape Library → Jetpac snapshot flow
- **TESTABILITY HARDENED**: 14 `data-testid` attributes added to HTML and Tape UI, `.sna` autoStart fixed

### Changes Made (this session)

#### Z80 Snapshot Parser Rewrite (src/loader.mjs)
- **5 catastrophic bugs fixed** in `Loader.parseZ80()`:
  1. All register header offsets were wrong (shifted ~5 bytes)
  2. No V2/V3 version detection (PC=0 at byte 6 signals extended header)
  3. No RLE decompression (ED ED NN VV scheme)
  4. Wrong RAM extraction ("last 48K" heuristic)
  5. Missing registers (DE, IX, IY, IFF1, IFF2, IM)
- New `_z80Decompress()` static helper for RLE decompression
- Correct V1 header offsets: A@0, F@1, C@2, B@3, L@4, H@5, PC@6, SP@8, I@10, R@11
- V2/V3: reads real PC from extended header offset 32, parses paged memory blocks

#### Alternate Register / Border Restore (src/main.mjs)
- `applySnapshot()` now restores alternate registers (A2/F2/B2/C2/D2/E2/H2/L2)
- Border colour from snapshot applied to ULA
- `autoStart` extended from `.z80` only → `.z80 || .sna`

#### data-testid Attributes (index.html, src/tapeUi.mjs)
- `index.html`: screen, tape-library-btn, status, tape-ui-root
- `tapeUi.mjs`: tape-search-input, tape-search-btn, tape-results, tape-results-count, tape-results-list, tape-detail, tape-detail-title, tape-detail-close, tape-files-list, tape-result-details-btn, tape-load-btn

#### Unit Tests (tests/unit/loader.z80.test.mjs)
- 19 tests in 6 describe blocks replacing 1 broken test
- Covers V1 uncompressed/compressed, V2 compressed/uncompressed, edge cases, decompression helper

#### E2E Test (tests/e2e/snapshot-jetpac.spec.mjs) — NEW
- 2 tests: full flow (@smoke) and status-text focused
- Stubbed network, data-testid selectors, canvas pixel retry loop + memory fallback

#### E2E Fixes (tape-library.spec.mjs, tape-cors-fallback.spec.mjs)
- Fixed `generateMinimalZ80Payload()` to use correct Z80 header offsets

### Test Results
- ✅ **126 unit tests passing** (31 files)
- ✅ **35 E2E tests passing** (all specs)
- ✅ Codacy analysis clean on all modified files

### Files Modified
| File | Change |
|------|--------|
| `src/loader.mjs` | Rewrite parseZ80(), add _z80Decompress() |
| `src/main.mjs` | Alternate regs + border restore; .sna autoStart |
| `src/tapeUi.mjs` | data-testid on 10 elements |
| `index.html` | data-testid on 4 elements |
| `tests/unit/loader.z80.test.mjs` | 19 new tests |
| `tests/e2e/snapshot-jetpac.spec.mjs` | NEW — 2 Jetpac E2E tests |
| `tests/e2e/tape-library.spec.mjs` | Fix Z80 header offsets |
| `tests/e2e/tape-cors-fallback.spec.mjs` | Fix Z80 header offsets |

## Open Questions/Issues

- Confirm legal status of ROM usage
- Follow-up: AbortController cleanup in tapeUi.mjs for stale fetches
- Follow-up: `willReadFrequently` on canvas 2D context
- Follow-up: Extract `createUI` helper to reduce Lizard nloc warning (74 LOC → <50)

## ⚠️ Critical Breadcrumbs

### Z80 Snapshot Format (never get wrong again):
1. **V1 header** is 30 bytes — PC at offset 6; if PC==0 → V2/V3 extended header follows
2. **V2/V3 extended header** starts at offset 30; `extLen` at offset 30 (LE16); real PC at offset 32; pages follow at 30+2+extLen
3. **Page mapping** (48K): page 4→0x8000, page 5→0xC000, page 8→0x4000
4. **RLE**: ED ED NN VV = repeat VV NN times; block length 0xFFFF = uncompressed 16384 bytes

### Never Modify Without Understanding:
1. **`_executeCBOperation()` in z80.mjs** — CB opcode ranges MUST be checked before sub-operation dispatch
2. **FLAGS system variable (0x5C3B)** — Used by character printing; corruption causes rendering bugs
3. **`parseZ80()` in loader.mjs** — Header offsets are verified against the spec; do not shift them

### Test Before Committing:
- Boot screen must show "© 1982 Sinclair Research Ltd" with full 8-pixel-tall characters
- Jetpac .z80 snapshot must load and show non-blank canvas
- `npm run test:unit && npm run test:e2e`

---
2026-01-28 - Updated with CB instruction fix and boot sequence success

## Recent Changes (2026-02-02)

- **Renderer readiness and backfill refinements**: Implemented deferred rendering snapshot logic in [`src/frameBuffer.mjs`](src/frameBuffer.mjs:1) to avoid mutating emulator RAM during frame generation and to enable conservative backfill strategies.
- **Selective forced backfill**: Added a smart forced backfill for the bottom display row that only forces the © glyph (0x7F) into column 0 when the display cell is clearly uninitialized (space/zero). This reduced duplicate © glyph artifacts.
- **Readiness gating**: Added `isDisplayReady()` check to gate render-time backfill and avoid premature patches before CHARS/ATTR memory is populated by ROM.
- **Diagnostics and instrumentation**: Added runtime instrumentation arrays (`globalThis.__TEST__.*`) and produced artifacts via `scripts/run-emu-diagnostics.mjs`.
  - Diagnostics artifacts written: `tests/_artifacts/frameBufferDecisions-2026-02-02T07-51-29-744Z.json`, `tests/_artifacts/charBitmapReads-2026-02-02T07-51-29-744Z.json`, `tests/_artifacts/canvas-2026-02-02T07-51-29-744Z.png`.
- **Keyboard input**: Keyboard wiring and matrix implementation reviewed; next task is to enable canvas/HTML keyboard integration to feed `src/input.mjs` and ULA port reads.

---

## 2026-02-06 — Test consolidation and stability

- Consolidated E2E tests under `tests/e2e` and updated test configs (`playwright.config.mjs`, `vitest.config.mjs`) to reflect canonical paths and exclude E2E from unit runs.
- Hardened glyph/visual tests to prefer debug-API pattern-matching (`snapshotGlyph`/`compareColumnPixels`) with a canvas pixel-sampling fallback where necessary.
- Fixed the `glyph-regression.spec.mjs` test (replaced fragile memory scan checks with debug-API + canvas fallback) and removed a duplicate rogue test.
- Strengthened `keyboard-screenshot.spec.mjs` to actively assert visible pixels using debug helpers and canvas sampling instead of relying only on screenshot file size.
- Performed 4 sequential headed+trace Playwright runs; all runs passed with no glyph-related flakes. Artifacts and traces are stored in `tests/e2e/_artifacts` for future triage if needed.

---
2026-02-02 - Snapshot of renderer/backfill/diagnostics work

## Recent housekeeping (2026-02-06)

- Added enforcement & best-practices blocks to `.github/copilot-instructions.md` and `.roocode/memory-bank.md` to standardize pre-commit and PR reminders (PR #6).
- Added `scripts/ensure-instruction-blocks.mjs` and a Husky pre-commit hook to append the blocks automatically when missing; PR #7 created to add these files.
- Archived non-core memory-bank documents to `archive/memory-bank/` to reduce noise and keep `memory-bank/` focused on core artifacts.
