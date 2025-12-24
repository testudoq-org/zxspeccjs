# ZX SpeccyJS — ZX Spectrum Emulator

A compact, developer-focused ZX Spectrum emulator implementation written in modern JavaScript. This repository aims to provide a clear, testable emulator core suitable for experimentation, education, and incremental feature contributions.

Key repo artifacts:
- [`index.html`](index.html:1) — demo page and simple UI for running the emulator in the browser.
- [`package.json`](package.json:1) — project metadata and scripts.
- [`docs/BUILD_AND_TESTING.md`](docs/BUILD_AND_TESTING.md:1) — detailed build & test instructions.

---

## 1. Overview

This project implements the core components of a Sinclair ZX Spectrum emulator: CPU (Z80) emulation, memory map, display (ULA), input, tape/ROM loading, and basic audio. The code is modular to make it easy for developers to read, test, and extend.

Primary goals:
- Faithful CPU and memory behaviour for learning and testing purposes.
- Clear separation of concerns between subsystems.
- Unit tests for core components to enable safe refactors.

Relevant design/context notes are captured in the memory bank: [`memory-bank/productContext.md`](memory-bank/productContext.md:1), [`memory-bank/activeContext.md`](memory-bank/activeContext.md:1) and [`memory-bank/systemPatterns.md`](memory-bank/systemPatterns.md:1).

---

## 2. Technical architecture and components

High-level components and responsibilities:

- CPU (Z80): [`src/z80.mjs`](src/z80.mjs:1)
  - Implements instruction decoding and execution loop.

- Memory: [`src/memory.mjs`](src/memory.mjs:1)
  - Linear address space, ROM/RAM mapping, and I/O hooks.

- ULA / Display: [`src/ula.mjs`](src/ula.mjs:1)
  - Frame timing, pixel rendering, and attribute handling.

- Input: [`src/input.mjs`](src/input.mjs:1)
  - Keyboard matrix emulation and event mapping.

- Sound: [`src/sound.mjs`](src/sound.mjs:1)
  - Beeper / simple audio output.

- Loader: [`src/loader.mjs`](src/loader.mjs:1)
  - ROM and tape (TAP) loading helpers and boot orchestration.

- Main runner / bootstrap: [`src/main.mjs`](src/main.mjs:1)
  - Wire-up code for modules, run loop, and browser integration via [`index.html`](index.html:1).

Build tooling and bundling: [`rollup.config.js`](rollup.config.js:1).

Architecture notes and decisions are tracked in [`memory-bank/decisionLog.md`](memory-bank/decisionLog.md:1).

---

## 3. Setup and usage

Prerequisites
- Node.js (LTS recommended)
- A modern browser for the demo page

Quick start (developer):

```bash
# Install dependencies
npm install

# Run a local dev server or bundler (see package.json for scripts)
npm run dev
```

Open the demo: [`index.html`](index.html:1) (served by dev server) or open the file directly for static testing.

Build for production:

```bash
npm run build
```

If you need detailed instructions or CI steps, see: [`docs/BUILD_AND_TESTING.md`](docs/BUILD_AND_TESTING.md:1).

---

## 4. File structure and key components

Top-level overview (most relevant files):

- [`src/`](src:1)
  - [`src/z80.mjs`](src/z80.mjs:1) — Z80 CPU core and instruction set.
  - [`src/memory.mjs`](src/memory.mjs:1) — memory map and access helpers.
  - [`src/ula.mjs`](src/ula.mjs:1) — display timing and raster handling.
  - [`src/input.mjs`](src/input.mjs:1) — keyboard and input layer.
  - [`src/sound.mjs`](src/sound.mjs:1) — audio (beeper) output.
  - [`src/loader.mjs`](src/loader.mjs:1) — ROM/tape loader and initialisation utilities.
  - [`src/main.mjs`](src/main.mjs:1) — application bootstrap and wiring.

- [`index.html`](index.html:1) — minimal UI/debug hooks for the emulator.
- [`test/`](test:1)
  - [`test/z80.test.mjs`](test/z80.test.mjs:1) — unit tests for the CPU core.
- [`docs/BUILD_AND_TESTING.md`](docs/BUILD_AND_TESTING.md:1) — build and test reference.
- [`memory-bank/`](memory-bank:1) — project context, decisions, and progress notes (`productContext.md`, `activeContext.md`, `decisionLog.md`, `progress.md`, `systemPatterns.md`).

---

## 5. Testing and development workflow

Unit tests
- Tests are located under [`test/`](test:1). Example: [`test/z80.test.mjs`](test/z80.test.mjs:1).
- Run tests with the project test script (see [`package.json`](package.json:1)) or follow instructions in [`docs/BUILD_AND_TESTING.md`](docs/BUILD_AND_TESTING.md:1).

Development practices
- Write unit tests for any changes to CPU, memory, or timing-sensitive components before refactoring.
- Keep subsystems isolated: use the module boundaries in [`src/`](src:1) to stub or mock dependencies during testing.
- Use the memory-bank artifacts for project context and to document architectural decisions: [`memory-bank/`](memory-bank:1).

Debugging tips
- Use the demo UI in [`index.html`](index.html:1) for live inspection.
- Add targeted unit tests that reproduce faulty behaviour before fixing it.

---

## 6. Contributing

Contributions are welcome. Suggested workflow:
1. Open an issue describing the proposed change or bug.
2. Create a feature branch from `main`.
3. Add tests that cover new behaviour or reproduce the bug.
4. Submit a pull request with a clear description and link to related memory-bank notes if applicable.

Please respect the coding style used in the repository and run the test suite before submitting changes.

---

## 7. Credits and references

- Project notes, goals and architectural context: [`memory-bank/productContext.md`](memory-bank/productContext.md:1) and [`memory-bank/activeContext.md`](memory-bank/activeContext.md:1).
- Design and decision history: [`memory-bank/decisionLog.md`](memory-bank/decisionLog.md:1).
- ZX Spectrum hardware references and emulation resources are not included verbatim; refer to standard public sources (e.g., ZapSpectrum docs, Z80 instruction set references) when adding low-level behaviour.

---

License
- See the repository root for license information (add LICENSE if needed).

Contact
- Use the issue tracker for technical discussions and patch proposals.


