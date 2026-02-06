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

### Z80 Instruction Decoder Architecture

#### CB-Prefix Instructions (Critical!)
The CB prefix enables extended Z80 operations. **Opcode range checking is mandatory**:

```
CB Opcode Structure:
  Bits 7-6: Operation class
    00 (0x00-0x3F): Shift/Rotate operations
    01 (0x40-0x7F): BIT test operations  
    10 (0x80-0xBF): RES (reset bit) operations
    11 (0xC0-0xFF): SET (set bit) operations
  
  Bits 5-3: Bit number (0-7) or sub-operation type
  Bits 2-0: Register index (B=0, C=1, D=2, E=3, H=4, L=5, (HL)=6, A=7)
```

**CRITICAL RULE**: Always check `cbOpcode < 0x40` BEFORE checking shift/rotate sub-operations.
The `opType = (cbOpcode & 0xF8) >>> 3` calculation produces overlapping values across ranges!

Example of the bug pattern to avoid:
```javascript
// WRONG - opType from RES 0,(HL) (0x86) equals 0x10, matching RL range!
if (opType >= 0x10 && opType <= 0x17) { /* RL */ }

// CORRECT - Guard with opcode range first
if (cbOpcode < 0x40) {
  if (opType >= 0x10 && opType <= 0x17) { /* RL */ }
}
```

#### Memory-Mapped System Variables
Key system variables that ROM routines depend on:
- **FLAGS (0x5C3B)**: Printer/display flags - corrupted by CB instruction bugs
- **FRAMES (0x5C78-0x5C7A)**: 3-byte frame counter - managed by ROM, not ULA
- **ATTR-T (0x5C8F)**: Temporary attribute storage
- **P-FLAG (0x5C91)**: More flags for PRINT routines

### ULA Architecture

The ULA handles:
- Display rendering (screen memory at 0x4000-0x57FF, attributes at 0x5800-0x5AFF)
- Interrupt generation (50Hz vertical sync)
- Border color (via port 0xFE)
- Keyboard scanning

**Key Principle**: ULA should NOT directly modify system variables in RAM (0x5C00+).
The ROM is responsible for managing these. Previous bug: ULA was writing to FRAMES directly.

## Testing Patterns

- Incremental testing of modules (console logs, browser dev tools)
- Use Node.js REPL for quick tests
- Manual verification of emulation accuracy (boot to BASIC, run test programs)

### Critical Test Cases for Z80 CB Instructions

These test cases MUST pass to ensure ROM compatibility:

```javascript
// RES instructions (0x80-0xBF)
CB 86: RES 0,(HL) - Reset bit 0 at (HL), NOT rotate left
CB 8E: RES 1,(HL) - Reset bit 1 at (HL)
CB BE: RES 7,(HL) - Reset bit 7 at (HL)

// SET instructions (0xC0-0xFF)  
CB C6: SET 0,(HL) - Set bit 0 at (HL)
CB CE: SET 1,(HL) - Set bit 1 at (HL)
CB FE: SET 7,(HL) - Set bit 7 at (HL)

// BIT instructions (0x40-0x7F)
CB 46: BIT 0,(HL) - Test bit 0 at (HL)
CB 7E: BIT 7,(HL) - Test bit 7 at (HL)

// Shift/Rotate (0x00-0x3F) - ONLY execute for opcodes < 0x40
CB 06: RLC (HL)
CB 16: RL (HL)
CB 26: SLA (HL)
CB 3E: SRL A
```

### Boot Sequence Validation

The boot screen MUST display:
- "© 1982 Sinclair Research Ltd" in full 8-pixel-tall characters
- White border (border color 7)
- Black text on white background

If characters appear as single horizontal lines, check:
1. CB instruction decoder (especially RES/SET vs shift/rotate)
2. FLAGS system variable (0x5C3B) integrity
3. PR_ALL routine at 0x0B93 execution path

## Breadcrumbs: Avoiding Future Bugs

### High-Risk Areas (Modify With Caution)

1. **`_executeCBOperation()` in src/z80.mjs (line ~249)**
   - Contains the critical `if (cbOpcode < 0x40)` guard
   - Any changes to shift/rotate handling MUST preserve this guard
   - Test with boot sequence after ANY modification

2. **Character Printing Path**
   - ROM routine PR_ALL (0x0B93-0x0BC5) uses RES 0,(HL) on FLAGS
   - If FLAGS is corrupted, JR C branches incorrectly
   - D register must increment through scan lines 0-7

3. **System Variables (0x5C00-0x5CFF)**
   - ROM manages these, emulator should not write directly
   - Exception: Initial memory clearing during reset

### Regression Test Checklist

Before committing Z80 changes:
- [ ] Boot screen displays full copyright message
- [ ] Characters are 8 pixels tall, not 1 pixel
- [ ] CB 86 (RES 0,(HL)) does NOT execute as RL
- [ ] FLAGS at 0x5C3B maintains correct value during printing

---
2025-12-23 23:44:33 - Initial system patterns documented
2026-01-28 - Added CB instruction architecture and breadcrumbs for ROM/memory defects

## Repository housekeeping (2026-02-06)

- Centralized quality & test guidance added to both Copilot and RooCode instruction files (see `.github/copilot-instructions.md` and `.roocode/memory-bank.md`, PR #6).
- Added an automated, local enforcement script (`scripts/ensure-instruction-blocks.mjs`) and Husky pre-commit hook to ensure instruction blocks exist and are kept up-to-date (PR #7).
- Archive: optional memory-bank notes moved to `archive/memory-bank/` to keep system patterns focused on canonical rules and architecture.
