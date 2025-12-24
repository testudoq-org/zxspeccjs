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