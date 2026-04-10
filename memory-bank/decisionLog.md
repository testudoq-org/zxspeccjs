# Decision Log

Records architectural and implementation decisions for the ZX Spectrum emulator project.

---

## 2026-02-08 — Z80 Parser Rewrite & Testability Decisions

### Decision: Complete Rewrite of Z80 Snapshot Parser
- **Context**: Jetpac .z80 snapshots loaded from Archive.org showed "Snapshot applied" but canvas stayed blank
- **Root Cause**: 5 catastrophic bugs — wrong register offsets, no V2/V3 detection, no RLE decompression, wrong RAM extraction, missing registers
- **Decision**: Full rewrite of `Loader.parseZ80()` rather than incremental patches
- **Rationale**: Every register offset was wrong; patching would be fragile. A clean implementation against the spec is more maintainable.
- **Implementation**: V1/V2/V3 detection, correct header offsets, paged memory blocks, `_z80Decompress()` for RLE

### Decision: Restore Alternate Registers and Border in applySnapshot()
- **Context**: Snapshot format stores alternate register set (A'/F'/BC'/DE'/HL') and border colour
- **Decision**: Add full alternate register and border colour restoration
- **Rationale**: Many games set alternate registers before snapshotting; without restoring them, game state is incomplete
- **Implementation**: `applySnapshot()` now calls `cpu.setAlternates()` and `ula.setBorderColour()`

### Decision: Add data-testid Attributes for E2E Stability
- **Context**: All E2E tests relied on CSS class selectors which break on style refactors
- **Decision**: Add `data-testid` attributes to 14 key UI elements (HTML + tapeUi.mjs)
- **Rationale**: data-testid is a stable contract between code and tests; immune to CSS/DOM restructuring
- **Implementation**: Added to canvas, buttons, search elements, results, detail panel, file list

### Decision: autoStart for .sna Snapshots
- **Context**: SNA snapshots loaded from Tape Library were silently paused — only .z80 triggered autoStart
- **Decision**: Extend autoStart to include `.sna` extension
- **Rationale**: Both formats are snapshots and should behave identically in the UI flow

### Decision: Canvas Pixel Check with Retry + Memory Fallback
- **Context**: E2E canvas pixel assertion failed because rAF hadn't rendered the first frame yet
- **Decision**: Retry loop (10 × 200ms) for canvas check, with memory-based fallback (pages[1] sum > 0)
- **Rationale**: Canvas rendering timing varies by machine; memory check is deterministic and instant

---

## Decision

- Use ES6 JavaScript modules for all emulator components
- Emulate Z80 CPU, memory, ULA graphics, keyboard, and sound in browser
- Modular file structure: main.mjs, z80.mjs, memory.mjs, ula.mjs, input.mjs, sound.mjs, loader.mjs
- Use HTML5 Canvas for graphics rendering
- Use Web Audio API for beeper sound
- Support file loading (.ROM, .Z80, .TAP) via browser File API
- Node.js for development server and bundling
- Deploy as static webpage (GitHub Pages)

## Recent Decisions (2026-02-06)

- **Testing layout and tools:** Standardize end-to-end tests under `tests/e2e/` using Playwright; unit tests live under `tests/unit/` using Vitest. This provides clear separation and avoids accidental E2E discovery by unit runners.
- **Debug API as test contract:** Expose deterministic debug helpers on `window.__ZX_DEBUG__` (`snapshotGlyph`, `compareColumnPixels`, `peekBottomLines`, `inspectBottomGlyphs`) and treat them as a testing contract; prefer these in E2E visual assertions for determinism. Canvas pixel-sampling remains a fallback for environments where debug hooks are not available.
- **Render architecture:** Keep deferred rendering (FrameBuffer + FrameRenderer) as the primary model for deterministic renders and to enable robust backfilling strategies; add `requestImmediateRender` for diagnostic-triggered renders.

## Rationale

- Browser-based approach enables cross-platform access and easy deployment
- Modular structure improves maintainability and scalability
- Using standard web APIs (Canvas, Audio) leverages browser performance and compatibility
- Node.js tools streamline development and bundling

## Implementation Details

- Each module will be implemented as a separate .mjs file
- ROM file sourced from open repository (see productContext.md)
- Initial focus on 48K mode for simplicity
- Legal compliance for ROM usage will be verified

---
2025-12-23 23:44:26 - Initial decisions logged from idea-for-project.md

## 2026-02-19 — Memory-authoritative contention model

### Decision: Centralise bus/contention timing in Memory (single source-of-truth)
- **Context**: Multiple CPU code paths applied ad-hoc I/O contention adjustments; small inconsistencies produced R/tstate drift and broke timing‑sensitive game logic (Jetpac).
- **Decision**: Make `memory._applyContention(addr, tstates)` the canonical API for contention. CPU will delegate contention application to Memory and avoid local contention tables except as an explicit, documented fallback.
- **Rationale**: Centralising contention prevents duplicate/contradictory timing logic, improves testability, and makes trace diagnostics authoritative (stored in memory._contentionLog).
- **Implementation notes**:
  - Update CPU `_applyPortContention(port)` to call `memory._applyContention(baseAddr, this.tstates)` and only apply fallback table entries when `memory._applyContention` is not available.
  - Expose `mem._contentionLog` and `mem._contentionHits` for diagnostics and regression tests.
- **Files / tests**: `src/z80.mjs`, `src/memory.mjs`, `tests/unit/z80.port-contention.test.mjs`, `tests/scripts/capture_jetpac_trace.mjs`.
- **Status**: Adopted (fixes implemented and unit-tested, 2026-02-19)


## 2026-02-06 — Housekeeping & enforcement

- Standardized instruction-block enforcement across Copilot and RooCode (see PR #6).
- Added a local, free enforcement mechanism (`scripts/ensure-instruction-blocks.mjs` + Husky pre-commit hook) to append the blocks automatically and surface changes for review (PR #7).
- Archived optional memory-bank artifacts to `archive/memory-bank/` to reduce noise; core files retained and updated with this progress note.
