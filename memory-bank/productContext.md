# Product Context

This file provides a high-level overview of the ZX Spectrum emulator project for the web, based on [`memory-bank/idea-for-project.md`](memory-bank/idea-for-project.md:1).

---

## 2026-02-07 — Archive.org Tape Library Feature

### New Feature: Tape Library with Archive.org Integration
- **Purpose**: Browse and load ZX Spectrum games directly from Archive.org's software library
- **Supported Formats**: TAP, TZX (tapes), Z80, SNA (snapshots)
- **Architecture**:
  - `src/archiveClient.mjs`: Archive.org API client with caching (24h search, 7d metadata)
  - `src/tapeUi.mjs`: Search UI panel with keyboard support
- **User Flow**:
  1. Click "Tape Library" button
  2. Search for games (e.g., "Jet Set Willy")
  3. View search results with game metadata
  4. Click game to see available files
  5. Load snapshot (instant) or tape (streaming)

### Archive.org API Endpoints Used
- Search: `https://archive.org/advancedsearch.php?q=collection:softwarelibrary_zx_spectrum title:"query"`
- Metadata: `https://archive.org/metadata/{identifier}`
- Download: `https://archive.org/download/{identifier}/{filename}`

### File Format Priority
- Z80/SNA snapshots shown first (direct memory load, instant startup)
- TAP/TZX tapes shown after (stream-based loading)

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
