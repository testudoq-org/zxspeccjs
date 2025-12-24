# System Patterns

Documents coding, architectural, and testing patterns for the ZX Spectrum emulator project.

## Coding Patterns

- Use ES6 modules (.mjs) for all source files
- Modular separation: CPU, memory, graphics, input, sound, loader, main loop
- Use descriptive comments and AI-generated prompts for code generation

## Architectural Patterns

- Layered architecture: separation of emulation logic, UI, and I/O
- Event-driven updates (requestAnimationFrame for rendering, browser events for input)
- File-based modularity for maintainability

## Testing Patterns

- Incremental testing of modules (console logs, browser dev tools)
- Use Node.js REPL for quick tests
- Manual verification of emulation accuracy (boot to BASIC, run test programs)

---
2025-12-23 23:44:33 - Initial system patterns documented from idea-for-project.md