# Product Context

This file provides a high-level overview of the ZX Spectrum emulator project for the web, based on [`memory-bank/idea-for-project.md`](memory-bank/idea-for-project.md:1).

## Project Goal

Build a ZX Spectrum emulator that runs entirely in the browser using ES6 JavaScript modules, emulating the Z80 CPU, memory, graphics, keyboard, and sound, with a simple UI and file loading support.

## Key Features

- Z80 CPU emulation (opcode execution, registers, interrupts, timing)
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