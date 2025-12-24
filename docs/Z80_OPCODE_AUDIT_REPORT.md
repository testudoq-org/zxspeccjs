# Z80 Opcode Implementation Audit Report
## ZX Spectrum Emulator Boot Failure Analysis

**Date:** 2025-12-24  
**Issue:** Blue-black screen of death - ROM boot failure  
**Status:** CRITICAL - Multiple core opcode groups missing  

---

## Executive Summary

The ZX Spectrum emulator is experiencing startup failures due to **critical gaps in Z80 opcode implementation**. While basic opcodes are implemented, the emulator is missing entire families of opcodes that are essential for system initialization, memory management, and ROM operation.

**Root Cause:** Complete absence of ED-prefixed, DD-prefixed, and FD-prefixed opcode families, plus missing 16-bit operations and system control opcodes.

---

## Current Implementation Analysis

### ✅ Implemented Opcodes (Partial)
- **Basic Operations:** NOP, LD r,n, LD r,r (register-register)
- **Memory Operations:** LD (HL),r, LD (HL),n, LD A,(nn), LD (nn),A
- **Arithmetic:** ADD A,r (subset), SUB r (partial), INC/DEC for 8-bit registers
- **Logical:** AND/OR/XOR/CP operations for registers and (HL)
- **Stack:** PUSH/POP for AF, BC, DE, HL
- **Control Flow:** JP, JR, CALL, RET with conditions
- **CB-prefixed:** RLC/RRC/RL/RR, SLA/SRA/SRL, BIT, RES, SET
- **Basic I/O:** IN A,(n), OUT (n),A
- **RST Instructions:** All 8 RST vectors implemented

### ❌ Missing Critical Opcode Families

#### 1. **ED-Prefixed Operations (0xED)** - CRITICAL
**Impact:** HIGH - Used extensively in ROM for system calls and memory management

**Key Missing Opcodes:**
- `ED 6B` - LD HL,(nn) - **BOOT CRITICAL**
- `ED 7B` - LD SP,(nn) - **BOOT CRITICAL**  
- `ED 4A` - ADC HL,BC - **BOOT CRITICAL**
- `ED 5A` - ADC HL,DE - **BOOT CRITICAL**
- `A` - ADC HL,HL - **BOOT CRED 6ITICAL**
- `ED 7A` - ADC HL,SP - **BOOT CRITICAL**
- `ED 42` - SBC HL,BC - **BOOT CRITICAL**
- `ED 52` - SBC HL,DE - **BOOT CRITICAL**
- `ED 62` - SBC HL,HL - **BOOT CRITICAL**
- `ED 72` - SBC HL,SP - **BOOT CRITICAL**
- `ED 44` - NEG - **BOOT CRITICAL**
- `ED 45` - RETN - **BOOT CRITICAL**
- `ED 4D` - RETI - **BOOT CRITICAL**
- `ED 46` - IM 0 - **BOOT CRITICAL**
- `ED 56` - IM 1 - **BOOT CRITICAL**
- `ED 5E` - IM 2 - **BOOT CRITICAL**
- `ED 47` - LD I,A - System control
- `ED 57` - LD A,I - System control  
- `ED 4F` - LD R,A - System control
- `ED 5F` - LD A,R - System control

#### 2. **DD-Prefixed Operations (IX Register)** - CRITICAL  
**Impact:** HIGH - Used extensively in ROM for indexed memory operations

**Key Missing Opcodes:**
- `DD 2A nn` - LD IX,(nn) - **BOOT CRITICAL**
- `DD 22 nn` - LD (nn),IX - **BOOT CRITICAL**
- `DD F9` - LD SP,IX - **BOOT CRITICAL**
- `DD E1` - POP IX - **BOOT CRITICAL**
- `DD E5` - PUSH IX - **BOOT CRITICAL**
- `DD 34 d` - INC (IX+d) - **BOOT CRITICAL**
- `DD 35 d` - DEC (IX+d) - **BOOT CRITICAL**
- `DD 36 d,n` - LD (IX+d),n - **BOOT CRITICAL**
- `DD 46 d` - LD B,(IX+d) - **BOOT CRITICAL**
- `DD 4E d` - LD C,(IX+d) - **BOOT CRITICAL**
- `DD 56 d` - LD D,(IX+d) - **BOOT CRITICAL**
- `DD 5E d` - LD E,(IX+d) - **BOOT CRITICAL**
- `DD 66 d` - LD H,(IX+d) - **BOOT CRITICAL**
- `DD 6E d` - LD L,(IX+d) - **BOOT CRITICAL**
- `DD 77 d` - LD (IX+d),A - **BOOT CRITICAL**
- `DD 70 d` - LD (IX+d),B - **BOOT CRITICAL**
- `DD 71 d` - LD (IX+d),C - **BOOT CRITICAL**
- `DD 72 d` - LD (IX+d),D - **BOOT CRITICAL**
- `DD 73 d` - LD (IX+d),E - **BOOT CRITICAL**
- `DD 74 d` - LD (IX+d),H - **BOOT CRITICAL**
- `DD 75 d` - LD (IX+d),L - **BOOT CRITICAL**
- `DD 7E d` - LD A,(IX+d) - **BOOT CRITICAL**

#### 3. **FD-Prefixed Operations (IY Register)** - CRITICAL
**Impact:** HIGH - Used extensively in ROM for indexed memory operations

**Same patterns as DD but with IY register:**
- `FD 2A nn` - LD IY,(nn)
- `FD 22 nn` - LD (nn),IY  
- `FD F9` - LD SP,IY
- `FD E1` - POP IY
- `FD E5` - PUSH IY
- All indexed operations with IY (FD 34 d, FD 35 d, etc.)

#### 4. **Missing 16-bit Operations** - HIGH
**Impact:** HIGH - Essential for memory management and stack operations

**Missing Opcodes:**
- `09` - ADD HL,BC - **BOOT CRITICAL**
- `19` - ADD HL,DE - **BOOT CRITICAL**  
- `29` - ADD HL,HL - **BOOT CRITICAL**
- `39` - ADD HL,SP - **BOOT CRITICAL**
- `03` - INC BC - **BOOT CRITICAL**
- `13` - INC DE - **BOOT CRITICAL**
- `23` - INC HL - **BOOT CRITICAL**
- `33` - INC SP - **BOOT CRITICAL**
- `0B` - DEC BC - **BOOT CRITICAL**
- `1B` - DEC DE - **BOOT CRITICAL**
- `2B` - DEC HL - **BOOT CRITICAL**
- `3B` - DEC SP - **BOOT CRITICAL**
- `F9` - LD SP,HL - **BOOT CRITICAL**

#### 5. **Missing Flag and System Operations** - MEDIUM
**Impact:** MEDIUM - Required for proper ROM operation

**Missing Opcodes:**
- `37` - SCF (Set Carry Flag) - **BOOT CRITICAL**
- `3F` - CCF (Complement Carry Flag) - **BOOT CRITICAL**
- `2F` - CPL (Complement A) - **BOOT CRITICAL**
- `ED A0` - LDI (Block Transfer)
- `ED A1` - LDD (Block Transfer)
- `ED B0` - LDIR (Block Transfer)  
- `ED B1` - LDDR (Block Transfer)
- `ED A8` - LDI (CPI)
- `ED A9` - LDD (CPD)
- `ED B8` - LDIR (CPIR)
- `ED B9` - LDDR (CPDR)

#### 6. **Missing Exchange Operations** - MEDIUM
**Impact:** MEDIUM - Used for register swapping

**Missing Opcodes:**
- `D9` - EXX (Exchange all register pairs) - **BOOT CRITICAL**
- `08` - EX AF,AF' (Exchange AF with AF') - **BOOT CRITICAL**

#### 7. **Missing Arithmetic Operations** - MEDIUM  
**Impact:** MEDIUM - Arithmetic with carry

**Missing Opcodes:**
- `8A` - ADC A,D - **BOOT CRITICAL**
- `8B` - ADC A,E - **BOOT CRITICAL**  
- `8C` - ADC A,H - **BOOT CRITICAL**
- `8D` - ADC A,L - **BOOT CRITICAL**
- `8E` - ADC A,(HL) - **BOOT CRITICAL**
- `9A` - SBC A,B - **BOOT CRITICAL**
- `9B` - SBC A,C - **BOOT CRITICAL**
- `9C` - SBC A,D - **BOOT CRITICAL**  
- `9D` - SBC A,E - **BOOT CRITICAL**
- `9E` - SBC A,(HL) - **BOOT CRITICAL**

---

## ZX Spectrum 48K ROM Boot Sequence Analysis

### Initial Boot Sequence (Address 0x0000)
```
F3     DI          - Disable interrupts ✅ IMPLEMENTED
B1     OR C        - Compare A with C ✅ IMPLEMENTED  
11 00 00 LD DE,0000h - Load DE with 0 ✅ IMPLEMENTED
C3 CB 11 JP 11CBh  - Jump to address 11CBh
```

### Critical Failure Point at 0x11CB
The ROM jumps to address 0x11CB where it encounters:

**`2A 5D 5C`** - **LD HL,(5C5Dh)** 
- This instruction requires **ED-prefixed operation handling**
- **MISSING FROM CURRENT IMPLEMENTATION** - This is the **PRIMARY BOOT FAILURE**

### Subsequent Boot Sequence Requirements
After the initial jump, the ROM requires:

1. **16-bit memory loads** (ED-prefixed)
2. **Indexed memory operations** (DD/FD-prefixed)  
3. **16-bit arithmetic** (ADD HL,BC etc.)
4. **System control operations** (IM modes, interrupt handling)
5. **Block memory operations** (for screen initialization)

---

## Critical Implementation Priority List

### 🔴 **PHASE 1: BOOT CRITICAL (Implement First)**
**Priority: IMMEDIATE - These opcodes are required for basic ROM operation**

1. **ED-Prefixed Core Memory Operations**
   - `ED 6B` - LD HL,(nn) 
   - `ED 7B` - LD SP,(nn)
   - `ED 22` - LD (nn),HL
   - `ED 2A` - LD HL,(nn)

2. **16-bit Arithmetic Operations**  
   - `09` - ADD HL,BC
   - `19` - ADD HL,DE
   - `29` - ADD HL,HL
   - `39` - ADD HL,SP

3. **DD/FD Prefixed Index Register Support**
   - DD/FD prefix handling
   - Basic indexed operations (LD r,(IX+d), LD (IX+d),r)

4. **System Flag Operations**
   - `37` - SCF
   - `3F` - CCF

### 🟡 **PHASE 2: SYSTEM CRITICAL (Implement Second)**  
**Priority: HIGH - Required for full ROM compatibility**

1. **16-bit Arithmetic with Carry**
   - `ED 4A` - ADC HL,BC
   - `ED 42` - SBC HL,BC
   - Individual ADC/SBC A,r operations

2. **Exchange Operations**
   - `D9` - EXX
   - `08` - EX AF,AF'

3. **Interrupt Management**
   - `ED 45` - RETN
   - `ED 4D` - RETI  
   - `ED 46` - IM 0
   - `ED 56` - IM 1
   - `ED 5E` - IM 2

4. **Extended Memory Operations**
   - `F9` - LD SP,HL
   - `ED 47` - LD I,A
   - `ED 57` - LD A,I

### 🟢 **PHASE 3: COMPREHENSIVE (Implement Last)**
**Priority: MEDIUM - Complete Z80 compatibility**

1. **Block Operations** (LDI, LDD, LDIR, LDDR)
2. **Search Operations** (CPI, CPD, CPIR, CPDR)  
3. **I/O Block Operations** (INIR, INDR, OTIR, OTDR)
4. **All remaining arithmetic/logical operations**

---

## Specific Implementation Guidance

### ED-Prefixed Handler Implementation

```javascript
// Add to switch statement in step() method
case 0xED: {
  const edOpcode = this.readByte(this.PC++);
  
  switch (edOpcode) {
    case 0x6B: { // LD HL,(nn)
      const addr = this.readWordFromPC();
      const value = this.readWord(addr);
      this._setHL(value);
      this.tstates += 16; return 16;
    }
    case 0x7B: { // LD SP,(nn) 
      const addr = this.readWordFromPC();
      this.SP = this.readWord(addr);
      this.tstates += 20; return 20;
    }
    case 0x22: { // LD (nn),HL
      const addr = this.readWordFromPC();
      this.writeWord(addr, this._getHL());
      this.tstates += 16; return 16;
    }
    case 0x4A: { // ADC HL,BC
      const hl = this._getHL();
      const bc = this._getBC();
      const carry = (this.F & 0x01) ? 1 : 0;
      const result = (hl + bc + carry) & 0xFFFF;
      
      // Set flags for ADC HL
      this._setFlagC((hl + bc + carry) > 0xFFFF);
      this._setFlagZ(result === 0);
      this._setFlagS(result & 0x8000);
      
      this._setHL(result);
      this.tstates += 15; return 15;
    }
    // ... continue with other ED opcodes
  }
}
```

### DD/FD-Prefixed Handler Implementation

```javascript
// Add index register properties to constructor
this.IX = 0;
this.IY = 0;

// Add prefix handling
case 0xDD: { // IX operations
  const prefixOpcode = this.readByte(this.PC++);
  // Handle IX-specific operations with displacement
  // Use this.IX instead of this.H
  // Handle signed 8-bit displacement
  break;
}

case 0xFD: { // IY operations  
  const prefixOpcode = this.readByte(this.PC++);
  // Handle IY-specific operations with displacement
  // Use this.IY instead of this.H
  // Handle signed 8-bit displacement
  break;
}
```

### 16-bit Operations Implementation

```javascript
// Add to main switch statement
case 0x09: { // ADD HL,BC
  const hl = this._getHL();
  const bc = this._getBC();
  const result = (hl + bc) & 0xFFFF;
  
  // Set flags for 16-bit addition
  this._setFlagC((hl + bc) > 0xFFFF);
  this._setFlagZ(result === 0);
  this._setFlagS(result & 0x8000);
  
  this._setHL(result);
  this.tstates += 11; return 11;
}

case 0xF9: { // LD SP,HL
  this.SP = this._getHL();
  this.tstates += 6; return 6;
}
```

---

## Flag Operation Requirements

Many operations require proper flag handling:

### Carry Flag Operations
- **SCF (0x37):** Set carry flag (C=1), H=0, N=0
- **CCF (0x3F):** Complement carry flag (C = NOT C), H=0, N=0

### Half-Carry Flag (H)
- Set on ADD/ADC when lower nibble overflows from bit 3 to bit 4
- Set on SUB/SBC when bit 4 requires borrow

### Parity/Overflow Flag (P/V)  
- For arithmetic operations: set when result overflows 8-bit signed range
- For logical operations: set when result has even parity
- For ADC/SBC: set when carry into bit 7 != carry out of bit 7

### Zero Flag (Z)
- Set when result is zero
- Clear when result is non-zero

---

## T-State Timing Requirements

Correct timing is critical for ZX Spectrum compatibility:

| Operation | T-States | Notes |
|-----------|----------|-------|
| LD HL,(nn) | 16 | ED-prefixed |
| LD SP,(nn) | 20 | ED-prefixed |
| ADD HL,BC | 11 | 16-bit |
| ADC HL,BC | 15 | 16-bit with carry |
| LD (IX+d),r | 19 | DD-prefixed |
| LD r,(IX+d) | 19 | DD-prefixed |
| EXX | 4 | Exchange all |

---

## Testing Strategy

### Phase 1 Test Cases
1. **ROM Boot Test:** Verify emulator can execute first 100 instructions
2. **Memory Load Test:** Test LD HL,(nn) operations  
3. **16-bit Arithmetic Test:** Test ADD HL,BC operations
4. **Flag Test:** Test SCF/CCF operations

### Phase 2 Test Cases  
1. **ED-Prefixed Test:** Comprehensive ED opcode testing
2. **Index Register Test:** DD/FD prefixed operations
3. **Exchange Test:** EXX, EX AF,AF' operations
4. **Interrupt Test:** IM modes, RETN, RETI

### Phase 3 Test Cases
1. **Block Operation Test:** LDI, LDIR, etc.
2. **Complete ROM Test:** Full 48K ROM execution
3. **Performance Test:** Correct timing verification

---

## Expected Outcome

With Phase 1 implementations, the emulator should:

1. **Successfully boot** past the initial ROM checks
2. **Execute the boot sequence** up to video initialization  
3. **Display the copyright message** instead of blue-black screen
4. **Reach the BASIC prompt** or crash at a later, more specific point

With Phases 2-3 implementations, the emulator should:

1. **Fully boot** to the ZX Spectrum BASIC prompt
2. **Execute ROM routines** correctly
3. **Handle memory management** properly
4. **Support full ROM-based functionality**

---

## Conclusion

The **primary cause of the boot failure** is the complete absence of ED-prefixed and DD/FD-prefixed operations, particularly `LD HL,(nn)` which the ROM encounters immediately after the initial boot sequence. 

**Immediate Action Required:**
1. Implement Phase 1 critical opcodes
2. Test ROM boot sequence execution
3. Add comprehensive Z80 opcode test suite

**Estimated Development Time:**
- Phase 1 (Boot Critical): 2-3 days
- Phase 2 (System Critical): 1-2 weeks  
- Phase 3 (Comprehensive): 1-2 weeks

The implementation of these missing opcode families is **essential** for any functional ZX Spectrum emulator and will resolve the current blue-black screen of death.