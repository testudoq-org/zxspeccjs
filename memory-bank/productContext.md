# Product Context

This file provides a high-level overview of the ZX Spectrum emulator project for the web, based on [`memory-bank/idea-for-project.md`](memory-bank/idea-for-project.md:1).

---

## 2026-02-08 — Z80 Parser Rewrite & Snapshot Loading Fixed

### Critical Fix: Z80 Snapshot Parser
- **Problem**: .z80 snapshots from Archive.org (including Jetpac) showed "applied" but canvas stayed blank
- **Root Cause**: 5 bugs in `Loader.parseZ80()` — wrong offsets, no V2/V3, no RLE decompression
- **Fix**: Complete parser rewrite with V1/V2/V3 support, correct offsets, paged memory blocks
- **Result**: Jetpac and other games now load and run correctly from Archive.org

### Testability Improvements
- 14 `data-testid` attributes added for stable E2E selectors
- Dedicated Jetpac E2E test with stubbed network
- 19 unit tests for Z80 parser (was 1 broken test)
- `.sna` autoStart from Tape Library UI
- **Total tests**: 126 unit + 35 E2E = 161 all passing

---

## Project Goal

Build a ZX Spectrum emulator that runs entirely in the browser using ES6 JavaScript modules, emulating the Z80 CPU, memory, graphics, keyboard, and sound, with a simple UI and file loading support.

## Key Features

- Z80 CPU emulation (opcode execution, registers, interrupts, timing)
	- ED-prefixed block instructions (LDI, LDIR, LDD, LDDR, CPI, CPIR, CPD, CPDR, INI, INIR, IND, INDR, OUTI, OTIR, OUTD, OTDR) now implemented for ROM boot/display compatibility
- Memory management (16KB ROM, 48KB RAM)
- Graphics via ULA emulation (HTML5 Canvas, 256x192 bitmap, 32x24 attributes)
- Keyboard input mapped from browser events
- Beeper sound using Web Audio API
- File loading (.ROM, .Z80, .TAP) via browser File API
- Simple HTML UI with Canvas, buttons, and virtual keyboard

## Overall Architecture

- Pure ES6 JavaScript modules (.mjs)
- Modular structure: `main.mjs`, `z80.mjs`, `memory.mjs`, `ula.mjs`, `input.mjs`, `sound.mjs`, `loader.mjs`
- Node.js for development (local server, bundling)
- Static deployment (e.g., GitHub Pages)
- Performance: requestAnimationFrame for rendering, cycle-accurate emulation

## References

- BIOS ROM from [spectrumforeveryone/zx-roms](https://github.com/spectrumforeveryone/zx-roms)
- Legal note: Ensure ROM usage complies with copyright

---
2025-12-23 23:44:07 - Initial product context created from idea-for-project.md

## Recent progress (2026-02-06)

- Added repository-level quality & test enforcement rules to `.github/copilot-instructions.md` and `.roocode/memory-bank.md` (see PR #6).
- Appended best-practices guidance for `.mjs`, ES6+, Vitest and Playwright to the RooCode memory-bank file.
- Added automation to ensure instruction blocks are present (`scripts/ensure-instruction-blocks.mjs`), an `ensure-instruction-blocks` npm script, and a Husky pre-commit hook to enforce changes locally (PR #7).
- Archived optional memory-bank notes to `archive/memory-bank/` to keep core files focused on canonical project context.
- Verify locally with: `npm run test:unit && npx playwright test tests/e2e --grep @smoke`.
