# Active Context

Tracks current status, recent changes, and open questions for the ZX Spectrum emulator project.

## Current Focus

- **BOOT SEQUENCE WORKING**: Character rendering bug fixed, copyright message displays correctly
- **CB INSTRUCTION FIX COMPLETE**: Critical Z80 instruction decoder bug resolved
- **VERIFIED**: Boot screen shows "© 1982 Sinclair Research Ltd" with full 8-pixel-tall characters

## Recent Changes (2026-01-28)

### Critical Bug Fix: CB-Prefix Instruction Decoder
- **Root Cause**: Shift/rotate handlers (opcodes 0x00-0x3F) incorrectly matched RES/SET opcodes (0x80-0xFF)
- **Fix Applied**: Added `if (cbOpcode < 0x40)` guard in `_executeCBOperation()` method
- **Impact**: RES 0,(HL) was executing as RL, corrupting FLAGS and breaking character printing
- **Result**: Full boot sequence now works correctly

### Files Modified
- `src/z80.mjs`: CB instruction decoder fix (line 249)
- `src/ula.mjs`: Removed direct FRAMES memory writes
- `src/frameBuffer.mjs`: New deferred rendering system
- `.gitignore`: Updated to exclude temp debug files

### Commit Details
- Branch: `fix/boot-sequence-quick-fix`
- Commit: 24 files changed, 3687 insertions, 961 deletions

## Architecture Changes

### Z80 CB Instruction Handling
The CB-prefix instruction decoder now correctly separates opcode ranges:
- 0x00-0x3F: Shift/Rotate (guarded with `if (cbOpcode < 0x40)`)
- 0x40-0x7F: BIT test
- 0x80-0xBF: RES (reset bit)
- 0xC0-0xFF: SET (set bit)

### ULA Changes
- `generateInterruptSync()` no longer writes directly to FRAMES (0x5C78)
- ROM is now responsible for all system variable management

## Open Questions/Issues

- Confirm legal status of ROM usage
- Determine scope for initial release (features, supported formats)
- Consider adding CB instruction unit tests to prevent regression

## ⚠️ Critical Breadcrumbs

### Never Modify Without Understanding:
1. **`_executeCBOperation()` in z80.mjs** - CB opcode ranges MUST be checked before sub-operation dispatch
2. **FLAGS system variable (0x5C3B)** - Used by character printing; corruption causes rendering bugs
3. **PR_ALL routine (0x0B93-0x0BC5)** - Critical character printing path; uses RES/SET on FLAGS

### Test Before Committing:
- Boot screen must show full 8-pixel-tall characters
- Copyright message "© 1982 Sinclair Research Ltd" must be readable
- Verify RES 0,(HL) at 0x5C3B produces correct FLAGS value

---
2026-01-28 - Updated with CB instruction fix and boot sequence success