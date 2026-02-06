# Decision Log

Records architectural and implementation decisions for the ZX Spectrum emulator project.

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

## 2026-02-06 — Housekeeping & enforcement

- Standardized instruction-block enforcement across Copilot and RooCode (see PR #6).
- Added a local, free enforcement mechanism (`scripts/ensure-instruction-blocks.mjs` + Husky pre-commit hook) to append the blocks automatically and surface changes for review (PR #7).
- Archived optional memory-bank artifacts to `archive/memory-bank/` to reduce noise; core files retained and updated with this progress note.
