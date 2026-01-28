# Defect Analysis: CB-Prefix Instruction Decoder Bug

**Date**: 2026-01-28  
**Severity**: Critical  
**Status**: RESOLVED  
**Affected Component**: `src/z80.mjs` - `_executeCBOperation()` method

---

## Executive Summary

A critical bug in the Z80 CB-prefix instruction decoder caused RES (reset bit) and SET (set bit) instructions to be incorrectly executed as shift/rotate operations. This corrupted the FLAGS system variable, breaking character printing and rendering the boot screen text as single horizontal pixel lines instead of proper 8-pixel-tall characters.

---

## Symptom Description

### What Users Saw
- Boot screen displayed "© 1982 Sinclair Research Ltd" as thin horizontal lines
- Each character appeared 1 pixel tall instead of 8 pixels
- The emulator appeared to be working but text was unreadable

### Technical Manifestation
- All 8 scan lines of each character were writing to the same screen memory address
- Only the last scan line remained visible (the previous 7 were overwritten)
- D register (which tracks scan line y-position) was not being incremented

---

## Root Cause Analysis

### The Buggy Code Pattern

```javascript
// In _executeCBOperation():
const opType = (cbOpcode & 0xF8) >>> 3;

// PROBLEM: These handlers executed for ALL opcodes, not just 0x00-0x3F
if (opType >= 0x10 && opType <= 0x17) {
  // RL (rotate left) handler
  const val = readTarget();
  const res = this._rl(val);
  writeTarget(res);
  return;
}
```

### Why This Was Wrong

The `opType` calculation produces overlapping values across different opcode ranges:

| Opcode | Instruction | opType Calculation | opType Value |
|--------|-------------|-------------------|--------------|
| 0x16   | RL (HL)     | (0x16 & 0xF8) >>> 3 | 0x02 |
| 0x86   | RES 0,(HL)  | (0x86 & 0xF8) >>> 3 | **0x10** |
| 0x96   | RES 2,(HL)  | (0x96 & 0xF8) >>> 3 | **0x12** |

The RL handler checked `opType >= 0x10 && opType <= 0x17`, which matched:
- RL (HL) at opcode 0x16 → opType = 0x02 (did NOT match, but other shifts did)
- RES 0,(HL) at opcode 0x86 → opType = 0x10 (INCORRECTLY matched!)

### The Cascade Effect

```
1. ROM calls RES 0,(HL) at address 0x5C3B (FLAGS system variable)
   ↓
2. Bug: Instruction executes as RL (rotate left) instead
   ↓
3. FLAGS value is corrupted (bits shifted, carry changed)
   ↓
4. In PR_ALL routine, corrupted FLAGS causes carry flag to be set
   ↓
5. JR C,PO_ATTR branch is taken, SKIPPING the INC D instruction
   ↓
6. D register stays at 0, all scan lines write to y=0
   ↓
7. Character appears as single horizontal line (only last scan line visible)
```

---

## The Fix

### Solution: Opcode Range Guard

```javascript
// Shift/rotate operations are only 0x00-0x3F
// 0x00..0x07 RLC, 0x08..0x0F RRC, 0x10..0x17 RL, 0x18..0x1F RR,
// 0x20..0x27 SLA, 0x28..0x2F SRA, 0x30..0x37 SLL, 0x38..0x3F SRL
if (cbOpcode < 0x40) {
  if (opType >= 0x00 && opType <= 0x07) { /* RLC */ }
  if (opType >= 0x08 && opType <= 0x0F) { /* RRC */ }
  if (opType >= 0x10 && opType <= 0x17) { /* RL */ }
  if (opType >= 0x18 && opType <= 0x1F) { /* RR */ }
  if (opType >= 0x20 && opType <= 0x27) { /* SLA */ }
  if (opType >= 0x28 && opType <= 0x2F) { /* SRA */ }
  if (opType >= 0x30 && opType <= 0x37) { /* SLL */ }
  if (opType >= 0x38 && opType <= 0x3F) { /* SRL */ }
}

// BIT/RES/SET handlers are outside the guard, only execute for their ranges
if (cbOpcode >= 0x40 && cbOpcode <= 0x7F) { /* BIT */ }
if (cbOpcode >= 0x80 && cbOpcode <= 0xBF) { /* RES */ }
if (cbOpcode >= 0xC0 && cbOpcode <= 0xFF) { /* SET */ }
```

### Key Insight

The CB opcode space is divided into four distinct regions based on bits 7-6:
- `00xxxxxx` (0x00-0x3F): Shift/Rotate
- `01xxxxxx` (0x40-0x7F): BIT test
- `10xxxxxx` (0x80-0xBF): RES (reset bit)
- `11xxxxxx` (0xC0-0xFF): SET (set bit)

The fix ensures shift/rotate handlers ONLY execute when `cbOpcode < 0x40`.

---

## Secondary Fix: ULA FRAMES Memory Writes

### Issue
The ULA's `generateInterruptSync()` method was directly writing to FRAMES (0x5C78-0x5C7A):

```javascript
// REMOVED - ULA should not manage system variables
const frames = this.memory.readByte(0x5C78) | 
               (this.memory.readByte(0x5C79) << 8) |
               (this.memory.readByte(0x5C7A) << 16);
const newFrames = (frames + 1) & 0xFFFFFF;
this.memory.writeByte(0x5C78, newFrames & 0xFF);
// etc.
```

### Why This Was Wrong
- FRAMES is a ROM-managed system variable
- The ROM interrupt handler at 0x0038 is responsible for incrementing FRAMES
- Direct ULA writes created race conditions and incorrect values

### Fix
Removed all direct FRAMES memory writes from ULA. The ROM now manages FRAMES through its interrupt handler.

---

## Verification

### Test Results
- ✅ Boot screen displays "© 1982 Sinclair Research Ltd" correctly
- ✅ All characters are 8 pixels tall
- ✅ FLAGS at 0x5C3B maintains correct value
- ✅ D register increments through scan lines 0-7
- ✅ Build passes without errors
- ✅ Codacy analysis clean

### Manual Verification Steps
1. Run `npm run build`
2. Open `index.html` in browser
3. Observe boot screen - text should be clearly readable
4. Each character should be proper 8x8 pixels, not horizontal lines

---

## Prevention: Breadcrumbs for Future Development

### Rules for CB Instruction Handling

1. **ALWAYS check opcode range FIRST**
   ```javascript
   // CORRECT order
   if (cbOpcode < 0x40) {
     // Then check sub-operation type
   }
   ```

2. **Never trust opType alone for dispatch**
   - `opType = (cbOpcode & 0xF8) >>> 3` produces overlapping values
   - Must be combined with opcode range check

3. **Test with ROM routines that use RES/SET**
   - PR_ALL (0x0B93): Character printing
   - KEYBOARD: Key scanning
   - Many ROM routines depend on RES/SET for bit manipulation

### Test Cases to Add

```javascript
describe('CB prefix instructions', () => {
  it('RES 0,(HL) should reset bit 0, not rotate', () => {
    // Set up HL pointing to memory with value 0xFF
    // Execute CB 86
    // Verify result is 0xFE (bit 0 cleared), not rotated
  });
  
  it('SET 0,(HL) should set bit 0, not rotate', () => {
    // Set up HL pointing to memory with value 0x00
    // Execute CB C6
    // Verify result is 0x01 (bit 0 set)
  });
});
```

### High-Risk Code Locations

| File | Line | Description | Risk Level |
|------|------|-------------|------------|
| src/z80.mjs | ~249 | `if (cbOpcode < 0x40)` guard | CRITICAL |
| src/z80.mjs | ~310-330 | RES handler | HIGH |
| src/z80.mjs | ~330-350 | SET handler | HIGH |
| src/ula.mjs | generateInterruptSync() | Must not write system vars | MEDIUM |

---

## Lessons Learned

1. **Instruction decoder bugs can have far-reaching effects**
   - A single mishandled opcode corrupted FLAGS, which broke character printing

2. **Bit manipulation is foundational**
   - RES/SET instructions are used throughout ROM for flag management
   - Getting these wrong breaks many seemingly unrelated features

3. **Emulator subsystems should respect boundaries**
   - ULA handles display, not system variables
   - ROM handles system variables, emulator should not bypass this

4. **Visual symptoms can mislead**
   - "Characters rendering as lines" suggested a display bug
   - Actual cause was in CPU instruction decoder

---

## Related Documentation

- [progress.md](progress.md) - Project progress history
- [systemPatterns.md](systemPatterns.md) - Architecture patterns and breadcrumbs
- [a-working-bootload-sequence.md](a-working-bootload-sequence.md) - Boot sequence analysis
