/* eslint-env browser */
/* global window, console */
/* eslint no-duplicate-case: "off" */
export class Z80 {
  constructor(memory) {
    this.mem = memory;

    // 8-bit registers
    this.A = 0;
    this.F = 0; // flags: S Z 0 H 0 P/V N C
    this.B = 0;
    this.C = 0;
    this.D = 0;
    this.E = 0;
    this.H = 0;
    this.L = 0;

    // Alternate register set (BC', DE', HL', AF')
    this.A_ = 0;  // Alternate A'
    this.F_ = 0;  // Alternate F'
    this.B_ = 0;  // Alternate B'
    this.C_ = 0;  // Alternate C'
    this.D_ = 0;  // Alternate D'
    this.E_ = 0;  // Alternate E'
    this.H_ = 0;  // Alternate H'
    this.L_ = 0;  // Alternate L'

    // 16-bit registers
    this.PC = 0x0000;
    this.SP = 0xFFFF;

    // Index registers (IX, IY)
    this.IX = 0x0000;
    this.IY = 0x0000;

    // Interrupts
    this.I = 0; // interrupt vector register (not heavily used here)
    this.R = 0; // memory refresh register
    this.IFF1 = false; // interrupt flip-flops
    this.IFF2 = false;
    this.IM = 0; // interrupt mode (0,1,2)

    // Timing
    this.tstates = 0;

    // HALT state
    this.halted = false;

    // Interrupt request line
    this.intRequested = false;

    // Debug callback
    this.debugCallback = null;
    // Micro-tracing for focused opcode/stack/memory events (disabled by default)
    this._microTraceEnabled = false;
    this._microLog = [];
    this.enableMicroTrace = () => { this._microTraceEnabled = true; this._microLog.length = 0; };
    this.disableMicroTrace = () => { this._microTraceEnabled = false; };
    this.getMicroLog = () => this._microLog;
    
    // Boot sequence tracking for reliable debug API
    this._bootAddresses = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
    this._visitedBootAddresses = new Set();
    
    // Debug settings
    this._debugVerbose = false; // Disabled by default to prevent memory issues in tests
    this._fallbackPC = 0; // For non-browser environments
  }

  // Reliable debug hook system for consistent PC monitoring
  _updateDebugHooks(pc) {
    // Always update global LAST_PC for immediate access (works in all environments)
    if (typeof window !== 'undefined') {
      window.__LAST_PC__ = pc;
      // Initialize PC watcher if not exists
      if (!window.__PC_WATCHER__) {
        // ...existing code...
      }
    }
    // ...existing code...
    // (Add any additional debug hook logic here if needed)
	}

  // Execute DDCB prefixed operations (IX with bit operations)
  _executeDDCBOperation(cbOpcode, addr) {
    const originalValue = this.readByte(addr);

    // BIT operations (0x40-0x7F)
    if (cbOpcode >= 0x40 && cbOpcode < 0x80) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = 1 << bit;
      const result = originalValue & mask;
      // BIT sets Z if bit is zero, resets if bit is set
      // Also sets H, resets N, preserves C
      this.F = (this.F & 0x01) | 0x10 | (result ? 0 : 0x40);
      // Undocumented: S is set if bit 7 AND bit being tested is 7
      if (bit === 7 && result) this.F |= 0x80;
      this.tstates += 20; return 20;
    }

    // RES operations (0x80-0xBF)
    if (cbOpcode >= 0x80 && cbOpcode < 0xC0) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = ~(1 << bit);
      this.writeByte(addr, originalValue & mask);
      this.tstates += 23; return 23;
    }

    // SET operations (0xC0-0xFF)
    if (cbOpcode >= 0xC0) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = 1 << bit;
      this.writeByte(addr, originalValue | mask);
      this.tstates += 23; return 23;
    }
    
    switch (cbOpcode) {
      case 0x00: // RLC (IX+d)
        this.writeByte(addr, this._rlc(originalValue));
        this.tstates += 23; return 23;
      case 0x01: // RRC (IX+d)
        this.writeByte(addr, this._rrc(originalValue));
        this.tstates += 23; return 23;
      case 0x02: // RL (IX+d)
        this.writeByte(addr, this._rl(originalValue));
        this.tstates += 23; return 23;
      case 0x03: // RR (IX+d)
        this.writeByte(addr, this._rr(originalValue));
        this.tstates += 23; return 23;
      case 0x04: // SLA (IX+d)
        this.writeByte(addr, this._sla(originalValue));
        this.tstates += 23; return 23;
      case 0x06: // SLL (IX+d)
        this.writeByte(addr, this._sll(originalValue));
        this.tstates += 23; return 23;
      case 0x05: // SRA (IX+d)
        this.writeByte(addr, this._sra(originalValue));
        this.tstates += 23; return 23;
      case 0x07: // SRL (IX+d)
        this.writeByte(addr, this._srl(originalValue));
        this.tstates += 23; return 23;
      default:
        // For other operations not handled above
        this.tstates += 23; return 23;
    }
  }

  // Execute FDCB prefixed operations (IY with bit operations)
  _executeFDCBOperation(cbOpcode, addr) {
    const originalValue = this.readByte(addr);

    // BIT operations (0x40-0x7F)
    if (cbOpcode >= 0x40 && cbOpcode < 0x80) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = 1 << bit;
      const result = originalValue & mask;
      // BIT sets Z if bit is zero, resets if bit is set
      // Also sets H, resets N, preserves C
      this.F = (this.F & 0x01) | 0x10 | (result ? 0 : 0x40);
      // Undocumented: S is set if bit 7 AND bit being tested is 7
      if (bit === 7 && result) this.F |= 0x80;
      this.tstates += 20; return 20;
    }

    // RES operations (0x80-0xBF)
    if (cbOpcode >= 0x80 && cbOpcode < 0xC0) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = ~(1 << bit);
      this.writeByte(addr, originalValue & mask);
      this.tstates += 23; return 23;
    }

    // SET operations (0xC0-0xFF)
    if (cbOpcode >= 0xC0) {
      const bit = (cbOpcode >> 3) & 0x07;
      const mask = 1 << bit;
      this.writeByte(addr, originalValue | mask);
      this.tstates += 23; return 23;
    }

    switch (cbOpcode) {
      case 0x00: // RLC (IY+d)
        this.writeByte(addr, this._rlc(originalValue));
        this.tstates += 23; return 23;
      case 0x01: // RRC (IY+d)
        this.writeByte(addr, this._rrc(originalValue));
        this.tstates += 23; return 23;
      case 0x02: // RL (IY+d)
        this.writeByte(addr, this._rl(originalValue));
        this.tstates += 23; return 23;
      case 0x03: // RR (IY+d)
        this.writeByte(addr, this._rr(originalValue));
        this.tstates += 23; return 23;
      case 0x04: // SLA (IY+d)
        this.writeByte(addr, this._sla(originalValue));
        this.tstates += 23; return 23;
      case 0x06: // SLL (IY+d)
        this.writeByte(addr, this._sll(originalValue));
        this.tstates += 23; return 23;
      case 0x05: // SRA (IY+d)
        this.writeByte(addr, this._sra(originalValue));
        this.tstates += 23; return 23;
      case 0x07: // SRL (IY+d)
        this.writeByte(addr, this._srl(originalValue));
        this.tstates += 23; return 23;
      default:
        // For other operations not handled above
        this.tstates += 23; return 23;
    }
  }

  // Execute plain CB-prefixed operations (no index)
  _executeCBOperation(cbOpcode) {
    const regIndex = cbOpcode & 0x07; // target register or (HL) when 6
    // opGroup is intentionally unused in current implementation; keep bitmask logic explicit if needed later.
    const opType = (cbOpcode & 0xF8) >>> 3; // operation group for shifts

    // Helper to read/write target register or (HL)
    const readTarget = () => {
      switch (regIndex) {
        case 0: return this.B;
        case 1: return this.C;
        case 2: return this.D;
        case 3: return this.E;
        case 4: return this.H;
        case 5: return this.L;
        case 6: return this.readByte(this._getHL());
        case 7: return this.A;
        default: return 0;
      }
    };
    const writeTarget = (val) => {
      val &= 0xFF;
      switch (regIndex) {
        case 0: this.B = val; break;
        case 1: this.C = val; break;
        case 2: this.D = val; break;
        case 3: this.E = val; break;
        case 4: this.H = val; break;
        case 5: this.L = val; break;
        case 6: this.writeByte(this._getHL(), val); break;
        case 7: this.A = val; break;
      }
    };

    // Shift/rotate operations are only 0x00-0x3F
    // 0x00..0x07 RLC, 0x08..0x0F RRC, 0x10..0x17 RL, 0x18..0x1F RR,
    // 0x20..0x27 SLA, 0x28..0x2F SRA, 0x30..0x37 SLL, 0x38..0x3F SRL
    if (cbOpcode < 0x40) {
      if (opType >= 0x00 && opType <= 0x07) {
        // RLC
        const val = readTarget();
        const res = this._rlc(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x08 && opType <= 0x0F) {
        // RRC
        const val = readTarget();
        const res = this._rrc(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x10 && opType <= 0x17) {
        // RL
        const val = readTarget();
        const res = this._rl(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x18 && opType <= 0x1F) {
        // RR
        const val = readTarget();
        const res = this._rr(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x20 && opType <= 0x27) {
        // SLA
        const val = readTarget();
        const res = this._sla(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x28 && opType <= 0x2F) {
        // SRA
        const val = readTarget();
        const res = this._sra(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x30 && opType <= 0x37) {
        // SLL
        const val = readTarget();
        const res = this._sll(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
      if (opType >= 0x38 && opType <= 0x3F) {
        // SRL
        const val = readTarget();
        const res = this._srl(val);
        writeTarget(res);
        if (regIndex === 6) { this.tstates += 15; return 15; }
        this.tstates += 8; return 8;
      }
    }

    // BIT b,r (0x40..0x7F)
    if (cbOpcode >= 0x40 && cbOpcode <= 0x7F) {
      const bit = (cbOpcode & 0x38) >>> 3;
      const val = readTarget();
      const tested = (val & (1 << bit)) !== 0;
      // Set flags: Z = !tested, S depends only if bit 7 tested, H=1, N=0, C preserved
      this._setFlagZ(!tested);
      if (bit === 7) this._setFlagS((val & 0x80) !== 0); else this.F &= ~0x80;
      this.F &= ~0x02; // N=0
      this.F |= 0x10; // H=1
      if (regIndex === 6) { this.tstates += 12; return 12; }
      this.tstates += 8; return 8;
    }

    // RES b,r (0x80..0xBF)
    if (cbOpcode >= 0x80 && cbOpcode <= 0xBF) {
      const bit = (cbOpcode & 0x38) >>> 3;
      const val = readTarget();
      const res = val & (~(1 << bit));
      writeTarget(res);
      if (regIndex === 6) { this.tstates += 15; return 15; }
      this.tstates += 8; return 8;
    }

    // SET b,r (0xC0..0xFF)
    if (cbOpcode >= 0xC0 && cbOpcode <= 0xFF) {
      const bit = (cbOpcode & 0x38) >>> 3;
      const val = readTarget();
      const res = val | (1 << bit);
      writeTarget(res);
      if (regIndex === 6) { this.tstates += 15; return 15; }
      this.tstates += 8; return 8;
    }

    // Fallback
    this.tstates += 8; return 8;
  }

  // Bit operation helpers
  _rlc(value) {
    const carry = value & 0x80;
    const result = ((value << 1) | (carry ? 1 : 0)) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _rrc(value) {
    const carry = value & 0x01;
    const result = ((value >> 1) | (carry ? 0x80 : 0)) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _rl(value) {
    const carry = value & 0x80;
    const result = ((value << 1) | ((this.F & 0x01) ? 1 : 0)) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _rr(value) {
    const carry = value & 0x01;
    const result = ((value >> 1) | (((this.F & 0x01) ? 1 : 0) << 7)) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _sla(value) {
    const carry = value & 0x80;
    const result = (value << 1) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _sra(value) {
    const carry = value & 0x01;
    const result = ((value >> 1) | (value & 0x80)) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _sll(value) {
    const carry = value & 0x80;
    const result = ((value << 1) | 0x01) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  _srl(value) {
    const carry = value & 0x01;
    const result = (value >> 1) & 0xFF;
    if (carry) this.F |= 0x01; else this.F &= ~0x01;
    this._setFlagZ(result);
    this._setFlagS(result);
    this.F &= ~0x10; this.F |= 0x10; // H=1
    this.F &= ~0x02; // N=0
    return result;
  }

  // Register pair helpers
  _getAF() { return ((this.A & 0xFF) << 8) | (this.F & 0xFF); }
  _setAF(v) { this.A = (v >>> 8) & 0xFF; this.F = v & 0xFF; }
  _getBC() { return ((this.B & 0xFF) << 8) | (this.C & 0xFF); }
  _setBC(v) { this.B = (v >>> 8) & 0xFF; this.C = v & 0xFF; }
  _getDE() { return ((this.D & 0xFF) << 8) | (this.E & 0xFF); }
  _setDE(v) { this.D = (v >>> 8) & 0xFF; this.E = v & 0xFF; }
  _getHL() { return ((this.H & 0xFF) << 8) | (this.L & 0xFF); }
  _setHL(v) { this.H = (v >>> 8) & 0xFF; this.L = v & 0xFF; }

  // Flag helpers
  _setFlagZ(v) { if ((v & 0xFF) === 0) this.F |= 0x40; else this.F &= ~0x40; }
  _setFlagS(v) { if ((v & 0xFF) & 0x80) this.F |= 0x80; else this.F &= ~0x80; }
  _setFlagC(cond) { if (cond) this.F |= 0x01; else this.F &= ~0x01; }
  _setFlagH(cond) { if (cond) this.F |= 0x10; else this.F &= ~0x10; }
  _setFlagPV(cond) { if (cond) this.F |= 0x04; else this.F &= ~0x04; }

  // Basic arithmetic helpers (add / adc / sub / sbc) to centralise flag updates
  _addA(n) {
    const before = this.A;
    const res = (before + n) & 0xFF;
    const carry = (before + n) > 0xFF;
    const half = ((before & 0x0F) + (n & 0x0F)) > 0x0F;
    this.A = res;
    this._setFlagS(this.A);
    this._setFlagZ(this.A);
    this._setFlagH(half);
    this._setFlagPV(((before ^ n) & (before ^ res) & 0x80) !== 0);
    this._setFlagC(carry);
    this.F &= ~0x02; // N = 0
  }

  _adcA(n) {
    const c = (this.F & 0x01) ? 1 : 0;
    const before = this.A;
    const sum = before + n + c;
    const res = sum & 0xFF;
    const carry = sum > 0xFF;
    const half = ((before & 0x0F) + (n & 0x0F) + c) > 0x0F;
    this.A = res;
    this._setFlagS(this.A);
    this._setFlagZ(this.A);
    this._setFlagH(half);
    this._setFlagPV(((before ^ n) & (before ^ res) & 0x80) !== 0);
    this._setFlagC(carry);
    this.F &= ~0x02; // N = 0
  }

  _subA(n) {
    const before = this.A;
    const res = (before - n) & 0xFF;
    const borrow = before < n;
    const half = (before & 0x0F) < (n & 0x0F);
    this.A = res;
    this._setFlagS(this.A);
    this._setFlagZ(this.A);
    this._setFlagH(half);
    this._setFlagPV(((before ^ n) & (before ^ res) & 0x80) !== 0);
    this._setFlagC(borrow);
    this.F |= 0x02; // N = 1
  }

  _sbcA(n) {
    const c = (this.F & 0x01) ? 1 : 0;
    const before = this.A;
    const val = n + c;
    const res = (before - val) & 0xFF;
    const borrow = before < val;
    const half = (before & 0x0F) < (val & 0x0F);
    this.A = res;
    this._setFlagS(this.A);
    this._setFlagZ(this.A);
    this._setFlagH(half);
    this._setFlagPV(((before ^ val) & (before ^ res) & 0x80) !== 0);
    this._setFlagC(borrow);
    this.F |= 0x02; // N = 1
  }

  // 16-bit arithmetic helpers (flags follow Z80 spec)
  _addHL(rr) {
    const hl = this._getHL();
    const res = hl + (rr & 0xFFFF);
    const result = res & 0xFFFF;
    const carry = res > 0xFFFF;
    const half = ((hl & 0x0FFF) + (rr & 0x0FFF)) > 0x0FFF;
    const preservedSZPV = this.F & 0xC4; // keep S,Z,P/V
    let f = preservedSZPV;
    if (carry) f |= 0x01; // C
    if (half) f |= 0x10;  // H
    // Bits 3 and 5 come from high byte of result
    f |= (result >> 8) & 0x28;
    this.F = f & ~0x02; // N = 0
    this._setHL(result);
  }

  _adcHL(rr) {
    const hl = this._getHL();
    const c = (this.F & 0x01) ? 1 : 0;
    const res = hl + (rr & 0xFFFF) + c;
    const result = res & 0xFFFF;
    const carry = res > 0xFFFF;
    const half = ((hl & 0x0FFF) + (rr & 0x0FFF) + c) > 0x0FFF;
    const overflow = ((~(hl ^ rr) & (hl ^ result) & 0x8000) !== 0);
    let f = 0;
    if (result & 0x8000) f |= 0x80; // S
    if (result === 0) f |= 0x40;    // Z
    if (overflow) f |= 0x04;        // P/V
    if (half) f |= 0x10;            // H
    if (carry) f |= 0x01;           // C
    f |= (result >> 8) & 0x28;      // undocumented 3/5
    this.F = f; // N cleared implicitly (addition)
    this._setHL(result);
  }

  _sbcHL(rr) {
    const hl = this._getHL();
    const c = (this.F & 0x01) ? 1 : 0;
    const res = hl - (rr & 0xFFFF) - c;
    const result = res & 0xFFFF;
    const carry = res < 0;
    const half = ((hl & 0x0FFF) - (rr & 0x0FFF) - c) < 0;
    const overflow = (((hl ^ rr) & (hl ^ result) & 0x8000) !== 0);
    let f = 0x02; // N = 1
    if (result & 0x8000) f |= 0x80; // S
    if (result === 0) f |= 0x40;    // Z
    if (overflow) f |= 0x04;        // P/V
    if (half) f |= 0x10;            // H
    if (carry) f |= 0x01;           // C
    f |= (result >> 8) & 0x28;      // undocumented 3/5
    this.F = f;
    this._setHL(result);
  }

  // CRITICAL: Reset CPU state for boot compatibility
  reset() {
    // Typical Z80 reset behaviour for ZX Spectrum 48K boot
    this.PC = 0x0000;
    this.SP = 0xFFFF;
    this.I = 0x3F; // CRITICAL: Set I register for 48K ROM behavior
    this.R = 0;
    this.IFF1 = false;
    this.IFF2 = false;
    this.IM = 1;
    this.tstates = 0;
    this.intRequested = false;
    this.halted = false;
  }

  // Request an interrupt from external devices (ULA)
  requestInterrupt() {
    this.intRequested = true;
  }

  // Run CPU for approximately count tstates by executing instructions
  runFor(count) {
    const start = this.tstates;
    // Safety: limit iterations to prevent infinite loops (each instruction is at least 4 tstates)
    const maxIterations = Math.ceil(count / 4) * 2; // 2x safety margin
    let iterations = 0;
    
    while ((this.tstates - start) < count) {
      if (++iterations > maxIterations) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[Z80] runFor: exceeded max iterations (${maxIterations}), stopping. PC=0x${this.PC.toString(16).padStart(4,'0')}, tstates=${this.tstates}, start=${start}, count=${count}`);
        }
        break;
      }
      
      const consumed = this.step();
      if (!consumed || consumed <= 0) {
        // Don't stop the entire run on a single bad/undefined step; log and advance 1 tstate to keep forward progress
        if (typeof console !== 'undefined' && console.warn && iterations <= 10) {
          console.warn(`[Z80] step returned ${consumed} at PC=0x${this.PC.toString(16).padStart(4,'0')}, advancing 1 tstate to continue`);
        }
        this.tstates += 1;
        // continue to next iteration until count reached
        continue;
      }
    }
  }

  // RST 0x10 CHAN_OPEN handler - open I/O channel (e.g., screen)
  _handleChanOpen() {
    const channel = this.A & 0xFF;
    if (channel === 0) {
      // Channel 0 points to screen channel at 0x5C39
      if (this.mem && typeof this.mem.write === 'function') {
        this.mem.write(0x5C37, 0x39);
        this.mem.write(0x5C38, 0x5C);
      } else if (this.mem && this.mem.mem instanceof Uint8Array) {
        // Use flat memory if available
        this.mem.mem[0x5C37 & 0xFFFF] = 0x39;
        this.mem.mem[0x5C38 & 0xFFFF] = 0x5C;
      }
    }
  }

  pushWord(value) {
    // Push high byte then low byte onto stack (Z80 order: high then low)
    const spBefore = this.SP;
    const hi = (value >>> 8) & 0xFF;
    const lo = value & 0xFF;
    this.SP = (this.SP - 1) & 0xFFFF;
    const addrHi = this.SP;
    this.writeByte(this.SP, hi);
    this.SP = (this.SP - 1) & 0xFFFF;
    const addrLo = this.SP;
    this.writeByte(this.SP, lo);
    if (this._microTraceEnabled) {
      this._microLog.push({ type: 'pushWord', value: value & 0xFFFF, spBefore, spAfter: this.SP, addrs: [addrHi, addrLo], bytes: [hi, lo], t: this.tstates });
    }
  }

  popWord() {
    const spBefore = this.SP;
    const low = this.readByte(this.SP);
    const high = this.readByte((this.SP + 1) & 0xFFFF);
    const val = ((high << 8) | low) & 0xFFFF;
    this.SP = (this.SP + 2) & 0xFFFF;
    if (this._microTraceEnabled) {
      this._microLog.push({ type: 'popWord', value: val, spBefore, spAfter: this.SP, addrs: [spBefore, (spBefore + 1) & 0xFFFF], bytes: [low, high], t: this.tstates });
    }
    return val;
  }

  // Memory access helpers
  readByte(addr) {
    if (this.mem && typeof this.mem.read === 'function') return this.mem.read(addr & 0xFFFF);
    if (this.mem && this.mem.mem && this.mem.mem instanceof Uint8Array) return this.mem.mem[addr & 0xFFFF];
    return 0;
  }

  writeByte(addr, value) {
    if (this.mem && typeof this.mem.write === 'function') return this.mem.write(addr & 0xFFFF, value & 0xFF);
    if (this.mem && this.mem.mem && this.mem.mem instanceof Uint8Array) this.mem.mem[addr & 0xFFFF] = value & 0xFF;
  }

  readWord(addr) {
    const lo = this.readByte(addr);
    const hi = this.readByte((addr + 1) & 0xFFFF);
    return (hi << 8) | lo;
  }

  writeWord(addr, value) {
    this.writeByte(addr, value & 0xFF);
    this.writeByte((addr + 1) & 0xFFFF, (value >>> 8) & 0xFF);
  }

  // Helpers to read immediate operands from PC
  readByteFromPC() {
    return this.readByte(this.PC++ & 0xFFFF);
  }

  readWordFromPC() {
    const lo = this.readByte(this.PC++ & 0xFFFF);
    const hi = this.readByte(this.PC++ & 0xFFFF);
    return (hi << 8) | lo;
  }

  // Execute a single instruction and return t-states consumed
  step() {
    // Handle interrupts (very basic IM 1)
    if (this.intRequested && this.IFF1) {
      this.halted = false; // HALT is exited on interrupt
      this.IFF1 = false; this.IFF2 = false;
      // maskable interrupt: push PC and jump to 0x0038
      this.pushWord(this.PC);
      this.PC = 0x0038;
      this.intRequested = false;
      const consumed = 13; // typical RST/INT cost approximation
      // Ensure reliable PC tracking for interrupts - ALWAYS call debug hooks
      this._updateDebugHooks(this.PC);
      if (this.debugCallback) {
        this.debugCallback(0xFF, this.PC - consumed); // Interrupt opcode approximation
      }
      this.tstates += consumed;
      return consumed;
    }

    // If CPU is halted and no interrupt is pending, burn 4 tstates per check
    if (this.halted) {
      this.tstates += 4;
      return 4;
    }

    const currentPC = this.PC;
    const opcode = this.readByte(this.PC++);
    
    // CRITICAL: ALWAYS call debug hooks for reliable PC tracking
    this._updateDebugHooks(currentPC);
    
    // Track debug execution if debug callback is set
    if (this.debugCallback) {
      this.debugCallback(opcode, currentPC);
    }

    // SP-change watcher: capture any change to SP during instruction execution
    const spBefore = this.SP;
    const finish = (cycles) => { this.tstates += cycles; if (this._microTraceEnabled && this.SP !== spBefore) this._microLog.push({ type: 'SPCHANGE', spBefore, spAfter: this.SP, t: this.tstates }); return cycles; };

    // Additional PC update after instruction execution for current PC value
    this._updateDebugHooks(this.PC);

    // Quick handler: implement LD r,r group (0x40-0x7F) to avoid stalling on common unimplemented opcodes
    if (opcode >= 0x40 && opcode <= 0x7F) {
      if (opcode === 0x76) { // HALT
        // HALT keeps executing this instruction until an interrupt occurs
        this.halted = true;
        this.PC = currentPC; // stay on HALT opcode
        return finish(4);
      }
      const dest = (opcode >> 3) & 0x07;
      const src = opcode & 0x07;
      const readReg = (idx) => { switch (idx) { case 0: return this.B; case 1: return this.C; case 2: return this.D; case 3: return this.E; case 4: return this.H; case 5: return this.L; case 6: return this.readByte(this._getHL()); case 7: return this.A; } };
      const writeReg = (idx, val) => { val &= 0xFF; switch (idx) { case 0: this.B = val; break; case 1: this.C = val; break; case 2: this.D = val; break; case 3: this.E = val; break; case 4: this.H = val; break; case 5: this.L = val; break; case 6: this.writeByte(this._getHL(), val); break; case 7: this.A = val; break; } };
      const val = readReg(src);
      writeReg(dest, val);
      const cycles = (src === 6 || dest === 6) ? 7 : 4;
      return finish(cycles);
    }

    switch (opcode) {
      case 0x00: // NOP
        return finish(4);
      case 0x07: { const bit7 = (this.A & 0x80) !== 0; this.A = ((this.A << 1) & 0xFF) | (bit7 ? 1 : 0); this._setFlagC(bit7); this.F &= ~0x02; this._setFlagH(false); this.tstates += 4; return 4; }
      case 0xA8: this.A ^= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xA9: this.A ^= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xAA: this.A ^= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xAB: this.A ^= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xAC: this.A ^= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xAD: this.A ^= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); return finish(4);
      case 0xAE: { const v = this.readByte(this._getHL()); this.A ^= v; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 7; return 7; }
      case 0xAF: { this.A ^= this.A; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }

      // RRCA -> 0x0F
      case 0x0F: {
        const carryOut = this.A & 0x01;
        this.A = (((carryOut) ? 0x80 : 0) | (this.A >>> 1)) & 0xFF;
        this._setFlagS(this.A);
        this._setFlagZ(this.A);
        this._setFlagC(!!carryOut);
        this.F &= ~0x10; // H = 0
        this.F &= ~0x02; // N = 0
        this.tstates += 4; return 4;
      }

      // LD B,n -> 0x06
      case 0x06: {
        const n = this.readByte(this.PC++);
        this.B = n & 0xFF;
        this.tstates += 7; return 7;
      }

      // INC C -> 0x0C
      case 0x0C: {
        const before = this.C;
        const res = (before + 1) & 0xFF;
        this.C = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      // ADD A,r (0x80..0x87 except 0x87 already exists)
      case 0x80: { this._addA(this.B); this.tstates += 4; return 4; }
      case 0x81: { this._addA(this.C); this.tstates += 4; return 4; }
      case 0x82: { this._addA(this.D); this.tstates += 4; return 4; }
      case 0x83: { this._addA(this.E); this.tstates += 4; return 4; }
      case 0x84: { this._addA(this.H); this.tstates += 4; return 4; }
      case 0x85: { this._addA(this.L); this.tstates += 4; return 4; }
      // 0x86 is ADD A,(HL)

      // ADC A,r (0x88..0x8F, skip 0x8E which is ADC A,(HL))
      case 0x88: { this._adcA(this.B); this.tstates += 4; return 4; }
      case 0x89: { this._adcA(this.C); this.tstates += 4; return 4; }
      case 0x8A: { this._adcA(this.D); this.tstates += 4; return 4; }
      case 0x8B: { this._adcA(this.E); this.tstates += 4; return 4; }
      case 0x8C: { this._adcA(this.H); this.tstates += 4; return 4; }
      case 0x8D: { this._adcA(this.L); this.tstates += 4; return 4; }
      // 0x8E is ADC A,(HL)

      // SUB r (0x90..0x97, skip 0x96 which is SUB (HL))
      case 0x90: { this._subA(this.B); this.tstates += 4; return 4; }
      case 0x91: { this._subA(this.C); this.tstates += 4; return 4; }
      case 0x92: { this._subA(this.D); this.tstates += 4; return 4; }
      case 0x93: { this._subA(this.E); this.tstates += 4; return 4; }
      case 0x94: { this._subA(this.H); this.tstates += 4; return 4; }
      case 0x95: { this._subA(this.L); this.tstates += 4; return 4; }
      // 0x96 is SUB A,(HL)

      // SBC A,r (0x98..0x9F, skip 0x9E which is SBC (HL))
      case 0x98: { this._sbcA(this.B); this.tstates += 4; return 4; }
      case 0x99: { this._sbcA(this.C); this.tstates += 4; return 4; }
      case 0x9A: { this._sbcA(this.D); this.tstates += 4; return 4; }
      case 0x9B: { this._sbcA(this.E); this.tstates += 4; return 4; }
      case 0x9C: { this._sbcA(this.H); this.tstates += 4; return 4; }
      case 0x9D: { this._sbcA(this.L); this.tstates += 4; return 4; }
      // 0x9E is SBC A,(HL)

      // AND r (0xA0..0xA7, 0xA6 is AND A,(HL))
      case 0xA0: { this.A &= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xA1: { this.A &= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xA2: { this.A &= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xA3: { this.A &= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xA4: { this.A &= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xA5: { this.A &= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this._setFlagH(true); this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      // 0xA6 is AND (HL) and already implemented

      // OR r (0xB0..0xB7, 0xB6 is OR (HL))
      case 0xB0: { this.A |= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xB1: { this.A |= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xB2: { this.A |= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xB3: { this.A |= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xB4: { this.A |= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      case 0xB5: { this.A |= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); this.F &= ~0x10; this.F &= ~0x02; this._setFlagC(false); this.tstates += 4; return 4; }
      // 0xB6 is OR (HL)

      // ADD A,n -> 0xC6
      case 0xC6: {
        const n = this.readByteFromPC(); this._addA(n); this.tstates += 7; return 7;
      }

      // ADC A,n -> 0xCE
      case 0xCE: {
        const n = this.readByteFromPC(); this._adcA(n); this.tstates += 7; return 7;
      }

      // SBC A,n -> 0xDE
      case 0xDE: {
        const n = this.readByteFromPC(); this._sbcA(n); this.tstates += 7; return 7;
      }

      // OR n -> 0xF6
      case 0xF6: {
        const n = this.readByteFromPC(); this.A |= n; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 7; return 7;
      }

      // CP r
      case 0x87: { // ADD A,A
        this._addA(this.A);
        this.tstates += 4; return 4;
      }
      case 0xBF: { const result = this.A - this.A; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.A); this.F |= 0x02; return finish(4); }
      case 0x9F: { // SBC A,A
        this._sbcA(this.A);
        this.tstates += 4; return 4;
      }
      case 0xA7: { // AND A - NOTE: Must clear C flag and N flag, set H flag
        this.A &= this.A; 
        this._setFlagZ(this.A); 
        this._setFlagS(this.A); 
        this._setFlagPV(((this.A.toString(2).match(/1/g)||[]).length % 2) === 0); // Parity
        this._setFlagH(true);   // H is set
        this.F &= ~0x02;        // N = 0
        this._setFlagC(false);  // C = 0 (CRITICAL for ROM boot!)
        this.tstates += 4; return 4; 
      }

      // LD HL, SP + e -> 0xF8
      case 0xF8: {
        const e = this.readByteFromPC();
        const signed = (e & 0x80) ? e - 0x100 : e;
        const sp = this.SP;
        const result = (sp + signed) & 0xFFFF;
        // Half-carry and carry for low byte addition
        const low = (sp & 0xFF) + (signed & 0xFF);
        this._setFlagH((low & 0x100) !== 0);
        this._setFlagC((sp + signed) > 0xFFFF);
        this._setHL(result);
        this.F &= ~0x02; // N = 0
        this.tstates += 12; return 12;
      }
      case 0xB8: { const result = this.A - this.B; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.B); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xB9: { const result = this.A - this.C; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.C); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xBA: { const result = this.A - this.D; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.D); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xBB: { const result = this.A - this.E; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.E); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xBC: { const result = this.A - this.H; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.H); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xBD: { const result = this.A - this.L; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.L); this.F |= 0x02; this.tstates += 4; return 4; }
      case 0xBE: { const v = this.readByte(this._getHL()); const result = this.A - v; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < v); this.F |= 0x02; this.tstates += 7; return 7; }

      // PUSH/POP
      case 0xC5: this.pushWord(this._getBC()); this.tstates += 11; return 11; // PUSH BC
      case 0xC1: this._setBC(this.popWord()); this.tstates += 10; return 10; // POP BC
      case 0xD5: this.pushWord(this._getDE()); this.tstates += 11; return 11; // PUSH DE
      case 0xD1: this._setDE(this.popWord()); this.tstates += 10; return 10; // POP DE
      case 0xE5: this.pushWord(this._getHL()); this.tstates += 11; return 11; // PUSH HL
      case 0xE1: this._setHL(this.popWord()); this.tstates += 10; return 10; // POP HL
      case 0xF5: this.pushWord(this._getAF()); this.tstates += 11; return 11; // PUSH AF
      case 0xF1: this._setAF(this.popWord()); this.tstates += 10; return 10; // POP AF

      // EX DE,HL
      case 0xEB: { const temp = this._getDE(); this._setDE(this._getHL()); this._setHL(temp); this.tstates += 4; return 4; }

      // EXX - Exchange BC/DE/HL with BC'/DE'/HL' -> 0xD9
      case 0xD9: {
        const tBC = this._getBC(); this._setBC(this.B_ << 8 | this.C_); this.B_ = (tBC >>> 8) & 0xFF; this.C_ = tBC & 0xFF;
        const tDE = this._getDE(); this._setDE(this.D_ << 8 | this.E_); this.D_ = (tDE >>> 8) & 0xFF; this.E_ = tDE & 0xFF;
        const tHL = this._getHL(); this._setHL(this.H_ << 8 | this.L_); this.H_ = (tHL >>> 8) & 0xFF; this.L_ = tHL & 0xFF;
        this.tstates += 4; return 4;
      }

      // EX AF,AF' (0x08) - Exchange AF with AF'
      case 0x08: { 
        const tempA = this.A; this.A = this.A_; this.A_ = tempA;
        const tempF = this.F; this.F = this.F_; this.F_ = tempF;
        this.tstates += 4; return 4;
      }
      case 0xCB: {
        const cbOpcode = this.readByte(this.PC++);
        return this._executeCBOperation(cbOpcode);
      }

      default:
        // Unknown opcode fallback: log and treat as 4-cycle NOP to allow progress
        if (this._debugVerbose) console.warn(`[Z80] Unimplemented opcode 0x${opcode.toString(16).padStart(2,'0')} at PC=0x${currentPC.toString(16).padStart(4,'0')}`);
        // If debugCallback is set, notify about unimplemented opcode
        if (this.debugCallback) this.debugCallback(opcode, currentPC);
        this.tstates += 4; return 4;
      
      case 0xC3: { // JP nn (unconditional)
        const addr = this.readWordFromPC();
        if (this._microTraceEnabled) this._microLog.push({ type: 'JP', target: addr, t: this.tstates });
        this.PC = addr;
        this.tstates += 10; return 10;
      }

      case 0xE9: { // JP (HL)
        const target = this._getHL();
        if (this._microTraceEnabled) this._microLog.push({ type: 'JP (HL)', target, t: this.tstates });
        this.PC = target;
        this.tstates += 4; return 4;
      }

      case 0xCA: { // JP Z,nn
        const addr = this.readWordFromPC();
        if (this.F & 0x40) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xD2: { // JP NC,nn
        const addr = this.readWordFromPC();
        if (!(this.F & 0x01)) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xDA: { // JP C,nn
        const addr = this.readWordFromPC();
        if (this.F & 0x01) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xE2: { // JP PO,nn
        const addr = this.readWordFromPC();
        if (!(this.F & 0x04)) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xEA: { // JP PE,nn
        const addr = this.readWordFromPC();
        if (this.F & 0x04) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xF2: { // JP P,nn
        const addr = this.readWordFromPC();
        if (!(this.F & 0x80)) this.PC = addr;
        this.tstates += 10; return 10;
      }
      case 0xFA: { // JP M,nn
        const addr = this.readWordFromPC();
        if (this.F & 0x80) this.PC = addr;
        this.tstates += 10; return 10;
      }

      // DJNZ e (relative) -> 0x10
      case 0x10: {
        const offset = this.readByte(this.PC++);
        this.B = (this.B - 1) & 0xFF;
        if (this.B !== 0) {
          const signed = (offset & 0x80) ? offset - 0x100 : offset;
          this.PC = (this.PC + signed) & 0xffff;
          this.tstates += 13; return 13;
        }
        this.tstates += 8; return 8;
      }

      // JR e (relative)
      case 0x18: {
        const offset = this.readByte(this.PC++);
        // signed
        const signed = (offset & 0x80) ? offset - 0x100 : offset;
        this.PC = (this.PC + signed) & 0xffff;
        this.tstates += 12; return 12;
      }
      
      // JR cc,e (conditional relative jumps)
      case 0x20: { // JR NZ,e
        const offset = this.readByte(this.PC++);
        if (!(this.F & 0x40)) {
          const signed = (offset & 0x80) ? offset - 0x100 : offset;
          this.PC = (this.PC + signed) & 0xffff;
        }
        this.tstates += 12; return 12;
      }
      case 0x28: { // JR Z,e
        const offset = this.readByte(this.PC++);
        if (this.F & 0x40) {
          const signed = (offset & 0x80) ? offset - 0x100 : offset;
          this.PC = (this.PC + signed) & 0xffff;
        }
        this.tstates += 12; return 12;
      }
      case 0x30: { // JR NC,e
        const offset = this.readByte(this.PC++);
        if (!(this.F & 0x01)) {
          const signed = (offset & 0x80) ? offset - 0x100 : offset;
          this.PC = (this.PC + signed) & 0xffff;
        }
        this.tstates += 12; return 12;
      }
      case 0x38: { // JR C,e
        const offset = this.readByte(this.PC++);
        if (this.F & 0x01) {
          const signed = (offset & 0x80) ? offset - 0x100 : offset;
          this.PC = (this.PC + signed) & 0xffff;
        }
        this.tstates += 12; return 12;
      }

      // CALL nn
      case 0xCD: {
        const addr = this.readWordFromPC();
        this.pushWord(this.PC);
        if (this._microTraceEnabled) this._microLog.push({ type: 'CALL', target: addr, sp: this.SP, t: this.tstates });
        this.PC = addr;
        this.tstates += 17; return 17;
      }
      
      // Memory operations with BC and DE
      case 0x01: { // LD BC,nn
        const val = this.readWordFromPC();
        this._setBC(val);
        this.tstates += 10; return 10;
      }

      case 0x21: { // LD HL,nn
        const val = this.readWordFromPC();
        this._setHL(val);
        this.tstates += 10; return 10;
      }

      case 0x31: { // LD SP,nn
        const val = this.readWordFromPC();
        this.SP = val & 0xFFFF;
        this.tstates += 10; return 10;
      }

      case 0x02: this.writeByte(this._getBC(), this.A); this.tstates += 7; return 7; // LD (BC), A
      case 0x0A: this.A = this.readByte(this._getBC()); this.tstates += 7; return 7; // LD A, (BC)

      case 0xFE: { // CP n
        const n = this.readByteFromPC();
        const result = (this.A - n) & 0xFF;
        this._setFlagZ(result);
        this._setFlagS(result);
        this._setFlagC(this.A < n);
        this._setFlagH(((this.A & 0x0F) < (n & 0x0F)));
        this.F |= 0x02; // N = 1
        this.tstates += 7; return 7;
      }

      case 0xE6: { // AND n
        const n = this.readByteFromPC();
        this.A = (this.A & n) & 0xFF;
        this._setFlagZ(this.A);
        this._setFlagS(this.A);
        // parity: even parity => PV = true
        const bits = (this.A.toString(2).match(/1/g) || []).length;
        this._setFlagPV((bits % 2) === 0);
        this._setFlagH(true);
        this.F &= ~0x02; // N = 0
        this._setFlagC(false);
        this.tstates += 7; return 7;
      }

      case 0x1F: { // RR A (RRA)
        const carryOut = this.A & 0x01;
        this.A = (((this.F & 0x01) ? 0x80 : 0) | (this.A >>> 1)) & 0xFF;
        this._setFlagS(this.A);
        this._setFlagZ(this.A);
        this._setFlagC(carryOut);
        this.F &= ~0x10; // H = 0
        this.F &= ~0x02; // N = 0
        this.tstates += 4; return 4;
      }

      case 0x04: { // INC B
        const before = this.B;
        const res = (before + 1) & 0xFF;
        this.B = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      case 0x05: { // DEC B
        const before = this.B;
        const res = (before - 1) & 0xFF;
        this.B = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x0D: { // DEC C
        const before = this.C;
        const res = (before - 1) & 0xFF;
        this.C = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x14: { // INC D
        const before = this.D;
        const res = (before + 1) & 0xFF;
        this.D = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      case 0x15: { // DEC D
        const before = this.D;
        const res = (before - 1) & 0xFF;
        this.D = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x16: { // LD D,n
        const n = this.readByte(this.PC++);
        this.D = n;
        this.tstates += 7; return 7;
      }

      case 0x1C: { // INC E
        const before = this.E;
        const res = (before + 1) & 0xFF;
        this.E = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      case 0x1D: { // DEC E
        const before = this.E;
        const res = (before - 1) & 0xFF;
        this.E = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x1E: { // LD E,n
        const n = this.readByte(this.PC++);
        this.E = n;
        this.tstates += 7; return 7;
      }

      case 0x24: { // INC H
        const before = this.H;
        const res = (before + 1) & 0xFF;
        this.H = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      case 0x25: { // DEC H
        const before = this.H;
        const res = (before - 1) & 0xFF;
        this.H = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x26: { // LD H,n
        const n = this.readByte(this.PC++);
        this.H = n;
        this.tstates += 7; return 7;
      }

      case 0x2C: { // INC L
        const before = this.L;
        const res = (before + 1) & 0xFF;
        this.L = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      case 0x2D: { // DEC L
        const before = this.L;
        const res = (before - 1) & 0xFF;
        this.L = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      case 0x2E: { // LD L,n
        const n = this.readByte(this.PC++);
        this.L = n;
        this.tstates += 7; return 7;
      }

      case 0xC0: { // RET NZ
        if (!(this.F & 0x40)) {
          const addr = this.popWord();
          if (this._microTraceEnabled) this._microLog.push({ type: 'RET', sp: this.SP, t: this.tstates });
          this.PC = addr;
          this.tstates += 11; return 11;
        }
        this.tstates += 5; return 5;
      }

      case 0xD6: { // SUB n
        const n = this.readByteFromPC();
        const result = (this.A - n) & 0xFF;
        this._setFlagZ(result);
        this._setFlagS(result);
        this._setFlagC(this.A < n);
        this._setFlagH(((this.A & 0x0F) < (n & 0x0F)));
        this._setFlagPV(((this.A ^ n) & (this.A ^ result) & 0x80) !== 0);
        this.F |= 0x02; // N = 1
        this.A = result;
        this.tstates += 7; return 7;
      }

      case 0x12: this.writeByte(this._getDE(), this.A); this.tstates += 7; return 7; // LD (DE), A
      case 0x1A: this.A = this.readByte(this._getDE()); this.tstates += 7; return 7; // LD A, (DE)

      // RET
      case 0xC9: {
        const ret = this.popWord();
        if (this._microTraceEnabled) this._microLog.push({ type: 'RET', value: ret, sp: this.SP, t: this.tstates });
        this.PC = ret;
        this.tstates += 10; return 10;
      }

      // INC A -> 0x3C
      case 0x3C: {
        const before = this.A;
        const res = (before + 1) & 0xFF;
        this.A = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x0F);
        this.F &= ~0x02; // N = 0
        this._setFlagPV(res === 0x80);
        this.tstates += 4; return 4;
      }

      // DEC A -> 0x3D
      case 0x3D: {
        const before = this.A;
        const res = (before - 1) & 0xFF;
        this.A = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      // LD A,n -> 0x3E
      case 0x3E: {
        const n = this.readByteFromPC();
        this.A = n & 0xFF;
        this.tstates += 7; return 7;
      }

      // DEC L -> 0x2D
      case 0x2D: {
        const before = this.L;
        const res = (before - 1) & 0xFF;
        this.L = res;
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 4; return 4;
      }

      // RET Z -> 0xC8
      case 0xC8: {
        if (this.F & 0x40) {
          const addr = this.popWord();
          if (this._microTraceEnabled) this._microLog.push({ type: 'RET', value: addr, sp: this.SP, t: this.tstates });
          this.PC = addr;
          this.tstates += 11; return 11;
        }
        this.tstates += 5; return 5;
      }

      // RET NC -> 0xD0
      case 0xD0: {
        if (!(this.F & 0x01)) {
          const addr = this.popWord();
          if (this._microTraceEnabled) this._microLog.push({ type: 'RET', value: addr, sp: this.SP, t: this.tstates });
          this.PC = addr;
          this.tstates += 11; return 11;
        }
        this.tstates += 5; return 5;
      }

      // RET C -> 0xD8
      case 0xD8: {
        if (this.F & 0x01) {
          const addr = this.popWord();
          if (this._microTraceEnabled) this._microLog.push({ type: 'RET', value: addr, sp: this.SP, t: this.tstates });
          this.PC = addr;
          this.tstates += 11; return 11;
        }
        this.tstates += 5; return 5;
      }

      // CALL M,nn -> 0xFC
      case 0xFC: {
        const addr = this.readWordFromPC();
        if (this.F & 0x80) { // M = negative (sign flag)
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL NZ,nn -> 0xC4
      case 0xC4: {
        const addr = this.readWordFromPC();
        if (!(this.F & 0x40)) { // NZ = not zero
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL Z,nn -> 0xCC
      case 0xCC: {
        const addr = this.readWordFromPC();
        if (this.F & 0x40) { // Z = zero
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL NC,nn -> 0xD4
      case 0xD4: {
        const addr = this.readWordFromPC();
        if (!(this.F & 0x01)) { // NC = no carry
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL C,nn -> 0xDC
      case 0xDC: {
        const addr = this.readWordFromPC();
        if (this.F & 0x01) { // C = carry
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL PO,nn -> 0xE4
      case 0xE4: {
        const addr = this.readWordFromPC();
        if (!(this.F & 0x04)) { // PO = parity odd (P/V = 0)
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL PE,nn -> 0xEC
      case 0xEC: {
        const addr = this.readWordFromPC();
        if (this.F & 0x04) { // PE = parity even (P/V = 1)
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // CALL P,nn -> 0xF4
      case 0xF4: {
        const addr = this.readWordFromPC();
        if (!(this.F & 0x80)) { // P = positive (sign flag = 0)
          this.pushWord(this.PC);
          this.PC = addr;
          this.tstates += 17; return 17;
        }
        this.tstates += 11; return 11;
      }

      // EX (SP),HL -> 0xE3
      case 0xE3: {
        const spLow = this.readByte(this.SP);
        const spHigh = this.readByte((this.SP + 1) & 0xFFFF);
        const hl = this._getHL();
        this.writeByte(this.SP, hl & 0xFF);
        this.writeByte((this.SP + 1) & 0xFFFF, (hl >> 8) & 0xFF);
        this._setHL((spHigh << 8) | spLow);
        this.tstates += 19; return 19;
      }

      // Memory ops: LD (HL), r
      case 0x70: this.writeByte(this._getHL(), this.B); this.tstates += 7; return 7; // LD (HL), B
      case 0x71: this.writeByte(this._getHL(), this.C); this.tstates += 7; return 7; // LD (HL), C
      case 0x72: this.writeByte(this._getHL(), this.D); this.tstates += 7; return 7; // LD (HL), D
      case 0x73: this.writeByte(this._getHL(), this.E); this.tstates += 7; return 7; // LD (HL), E
      case 0x74: this.writeByte(this._getHL(), this.H); this.tstates += 7; return 7; // LD (HL), H
      case 0x75: this.writeByte(this._getHL(), this.L); this.tstates += 7; return 7; // LD (HL), L
      case 0x77: this.writeByte(this._getHL(), this.A); this.tstates += 7; return 7; // LD (HL), A
      case 0x35: {
        const addr = this._getHL();
        const before = this.readByte(addr);
        const res = (before - 1) & 0xFF;
        this.writeByte(addr, res);
        this._setFlagS(res);
        this._setFlagZ(res);
        this._setFlagH((before & 0x0F) === 0x00);
        this.F |= 0x02; // N = 1
        this._setFlagPV(res === 0x7F);
        this.tstates += 11; return 11;
      }
      
      // Memory ops: LD (HL), n -> 0x36
      case 0x36: {
        const n = this.readByte(this.PC++);
        const hl = this._getHL();
        this.writeByte(hl, n);
        this.tstates += 10; return 10;
      }

      // LD A,(HL) -> 0x7E
      case 0x7E: {
        this.A = this.readByte(this._getHL());
        this.tstates += 7; return 7;
      }

      // ADD A,(HL) -> 0x86
      case 0x86: {
        const v = this.readByte(this._getHL());
        this._addA(v);
        this.tstates += 7; return 7;
      }

      // ADC A,(HL) -> 0x8E
      case 0x8E: {
        const v = this.readByte(this._getHL());
        this._adcA(v);
        this.tstates += 7; return 7;
      }

      // SUB A,(HL) -> 0x96
      case 0x96: {
        const v = this.readByte(this._getHL());
        this._subA(v);
        this.tstates += 7; return 7;
      }

      // SBC A,(HL) -> 0x9E
      case 0x9E: {
        const v = this.readByte(this._getHL());
        this._sbcA(v);
        this.tstates += 7; return 7;
      }

      // AND A,(HL) -> 0xA6
      case 0xA6: {
        const v = this.readByte(this._getHL());
        this.A &= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04;
        this.tstates += 7; return 7;
      }

      // OR A,(HL) -> 0xB6
      case 0xB6: {
        const v = this.readByte(this._getHL());
        this.A |= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04;
        this.tstates += 7; return 7;
      }

      // LD (nn), A -> 0x32
      case 0x32: {
        const addr = this.readWordFromPC();
        this.writeByte(addr, this.A);
        this.tstates += 13; return 13;
      }

      // LD A,(nn) -> 0x3A
      case 0x3A: {
        const addr = this.readWordFromPC();
        const val = this.readByte(addr);
        this.A = val;
        if (this._microTraceEnabled) this._microLog.push({ type: 'LD A,(nn)', addr, value: val, t: this.tstates });
        this.tstates += 13; return 13;
      }

      // LD HL,(nn) -> 0x2A
      case 0x2A: {
        const addr = this.readWordFromPC();
        const value = this.readWord(addr);
        this._setHL(value);
        if (this._microTraceEnabled) this._microLog.push({ type: 'LD HL,(nn)', addr, value, t: this.tstates });
        this.tstates += 16; return 16;
      }

      // LD (nn),HL -> 0x22
      case 0x22: {
        const addr = this.readWordFromPC();
        const value = this._getHL();
        this.writeWord(addr, value);
        if (this._microTraceEnabled) this._microLog.push({ type: 'LD (nn),HL', addr, value, t: this.tstates });
        this.tstates += 16; return 16;
      }

      // LD DE,nn -> 0x11
      case 0x11: {
        const value = this.readWordFromPC();
        this._setDE(value);
        this.tstates += 10; return 10;
      }

      // LD C,n -> 0x0E
      case 0x0E: {
        const n = this.readByteFromPC();
        this.C = n & 0xFF;
        this.tstates += 7; return 7;
      }

      // LD L,n -> 0x2E
      case 0x2E: {
        const n = this.readByteFromPC();
        this.L = n & 0xFF;
        this.tstates += 7; return 7;
      }

      // OR H -> 0xB4
      case 0xB4: {
        this.A |= this.H;
        this._setFlagZ(this.A);
        this._setFlagS(this.A);
        this.F &= ~0x10; // H = 0
        this.F &= ~0x04;
        this.tstates += 4; return 4;
      }

      // OR L -> 0xB5
      case 0xB5: {
        this.A |= this.L;
        this._setFlagZ(this.A);
        this._setFlagS(this.A);
        this.F &= ~0x10; // H = 0
        this.F &= ~0x04; // P/V = 0 (parity not computed here)
        this.tstates += 4; return 4;
      }

      case 0xDB: { // IN A,(n) - read port using A as high byte, immediate low byte
        const portLo = this.readByte(this.PC++);
        const port = ((this.A & 0xff) << 8) | (portLo & 0xff);
        let val = 0xff;
        if (this.io && typeof this.io.read === 'function') {
          try { val = this.io.read(port) & 0xff; } catch (e) { val = 0xff; }
        }
        this.A = val;
        this.tstates += 11; return 11;
      }
      case 0xD3: { // OUT (n),A - write A to port (A as high byte, imm low byte)
        const portLo = this.readByte(this.PC++);
        const port = ((this.A & 0xff) << 8) | (portLo & 0xff);
        if (this.io && typeof this.io.write === 'function') {
          try { this.io.write(port, this.A & 0xff, this.tstates); } catch (e) { /* ignore */ }
        }
        this.tstates += 11; return 11;
      }

      // RST instructions - push PC and jump to restart address
      case 0xc7: this.pushWord(this.PC); this.PC = 0x00; this.tstates += 11; return 11;
      case 0xcf: this.pushWord(this.PC); this.PC = 0x08; this.tstates += 11; return 11;
      case 0xd7: this.pushWord(this.PC); this.PC = 0x10; this.tstates += 11; return 11; // RST 10 - Print character
      case 0xdf: this.pushWord(this.PC); this.PC = 0x18; this.tstates += 11; return 11;
      case 0xe7: this.pushWord(this.PC); this.PC = 0x20; this.tstates += 11; return 11;
      case 0xef: this.pushWord(this.PC); this.PC = 0x28; this.tstates += 11; return 11;
      case 0xf7: this.pushWord(this.PC); this.PC = 0x30; this.tstates += 11; return 11;
      case 0xff: {
        this.pushWord(this.PC);
        this.PC = 0x38;
        this.tstates += 11;
        if (this._microTraceEnabled) this._microLog.push({ type: 'RST', opcode: 0xff, target: 0x38, sp: this.SP, t: this.tstates });
        return 11;
      }

      // 16-bit arithmetic operations
      case 0x09: { // ADD HL,BC
        this._addHL(this._getBC());
        this.tstates += 11; return 11;
      }

      case 0x19: { // ADD HL,DE
        this._addHL(this._getDE());
        this.tstates += 11; return 11;
      }

      case 0x29: { // ADD HL,HL
        this._addHL(this._getHL());
        this.tstates += 11; return 11;
      }

      case 0x39: { // ADD HL,SP
        this._addHL(this.SP);
        this.tstates += 11; return 11;
      }

      // 16-bit INC operations
      case 0x03: { // INC BC
        const bc = this._getBC();
        this._setBC((bc + 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x13: { // INC DE
        const de = this._getDE();
        this._setDE((de + 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x23: { // INC HL
        const hl = this._getHL();
        this._setHL((hl + 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x33: { // INC SP
        this.SP = (this.SP + 1) & 0xFFFF;
        this.tstates += 6; return 6;
      }

      // 16-bit DEC operations
      case 0x0B: { // DEC BC
        const bc = this._getBC();
        this._setBC((bc - 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x1B: { // DEC DE
        const de = this._getDE();
        this._setDE((de - 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x2B: { // DEC HL
        const hl = this._getHL();
        this._setHL((hl - 1) & 0xFFFF);
        this.tstates += 6; return 6;
      }
      case 0x3B: { // DEC SP
        this.SP = (this.SP - 1) & 0xFFFF;
        this.tstates += 6; return 6;
      }

      case 0xF9: { // LD SP,HL
        this.SP = this._getHL();
        this.tstates += 6; return 6;
      }

      // Flag operations
      case 0x37: { // SCF - Set Carry Flag
        this.F |= 0x01; // Set C flag
        this.F &= ~0x10; // Reset H flag
        this.F &= ~0x02; // Reset N flag
        this.tstates += 4; return 4;
      }

      case 0x3F: { // CCF - Complement Carry Flag
        if (this.F & 0x01) this.F &= ~0x01; else this.F |= 0x01; // Toggle C flag
        this.F &= ~0x10; // Reset H flag
        this.F &= ~0x02; // Reset N flag
        this.tstates += 4; return 4;
      }

      // CPL - Complement A (0x2F)
      case 0x2F: { // CPL - Complement accumulator
        this.A = (~this.A) & 0xFF;
        this.F |= 0x10; // H = 1
        this.F |= 0x02; // N = 1
        this.tstates += 4; return 4;
      }

      // DI - Disable Interrupts (0xF3)
      case 0xF3: { // DI - Disable interrupts
        this.IFF1 = false;
        this.IFF2 = false;
        this.tstates += 4; return 4;
      }

      // EI - Enable Interrupts (0xFB)
      case 0xFB: { // EI - Enable interrupts
        this.IFF1 = true;
        this.IFF2 = true;
        this.tstates += 4; return 4;
      }

      // DD prefix (IX register operations)
      case 0xDD: {
        const ddOpcode = this.readByte(this.PC++);
        
        switch (ddOpcode) {
          case 0x21: { // LD IX,nn
            this.IX = this.readWordFromPC();
            this.tstates += 14; return 14;
          }
          case 0x2A: { // LD IX,(nn)
            const addr = this.readWordFromPC();
            this.IX = this.readWord(addr);
            this.tstates += 20; return 20;
          }
          case 0x22: { // LD (nn),IX
            const addr = this.readWordFromPC();
            this.writeWord(addr, this.IX);
            this.tstates += 20; return 20;
          }
          case 0xF9: { // LD SP,IX
            this.SP = this.IX;
            this.tstates += 10; return 10;
          }
          case 0xE1: { // POP IX
            this.IX = this.popWord();
            this.tstates += 14; return 14;
          }
          case 0xE5: { // PUSH IX
            this.pushWord(this.IX);
            this.tstates += 15; return 15;
          }
          
          // IX with displacement operations
          case 0x34: { // INC (IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = (this.readByte(addr) + 1) & 0xFF;
            this.writeByte(addr, v);
            this._setFlagZ(v); this._setFlagS(v);
            this.tstates += 23; return 23;
          }
          case 0x35: { // DEC (IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = (this.readByte(addr) - 1) & 0xFF;
            this.writeByte(addr, v);
            this._setFlagZ(v); this._setFlagS(v);
            this.tstates += 23; return 23;
          }
          case 0x36: { // LD (IX+d),n
            const d = this.readByte(this.PC++);
            const n = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, n);
            this.tstates += 19; return 19;
          }
          
          // LD r,(IX+d) operations
          case 0x46: { // LD B,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.B = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x4E: { // LD C,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.C = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x56: { // LD D,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.D = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x5E: { // LD E,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.E = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x66: { // LD H,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.H = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x6E: { // LD L,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.L = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x7E: { // LD A,(IX+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.A = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          
          // LD (IX+d),r operations
          case 0x70: { // LD (IX+d),B
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.B);
            this.tstates += 19; return 19;
          }
          case 0x71: { // LD (IX+d),C
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.C);
            this.tstates += 19; return 19;
          }
          case 0x72: { // LD (IX+d),D
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.D);
            this.tstates += 19; return 19;
          }
          case 0x73: { // LD (IX+d),E
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.E);
            this.tstates += 19; return 19;
          }
          case 0x74: { // LD (IX+d),H
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.H);
            this.tstates += 19; return 19;
          }
          case 0x75: { // LD (IX+d),L
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.L);
            this.tstates += 19; return 19;
          }
          case 0x77: { // LD (IX+d),A
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            this.writeByte(addr, this.A);
            this.tstates += 19; return 19;
          }
          
          // ADD A,(IX+d)
          case 0x86: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._addA(v);
            this.tstates += 19; return 19;
          }
          
          // ADC A,(IX+d)
          case 0x8E: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._adcA(v);
            this.tstates += 19; return 19;
          }
          
          // SUB A,(IX+d)
          case 0x96: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._subA(v);
            this.tstates += 19; return 19;
          }
          
          // SBC A,(IX+d)
          case 0x9E: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._sbcA(v);
            this.tstates += 19; return 19;
          }
          
          // AND A,(IX+d)
          case 0xA6: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A &= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // OR A,(IX+d)
          case 0xB6: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A |= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // XOR A,(IX+d)
          case 0xAE: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A ^= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // CP A,(IX+d)
          case 0xBE: {
            const d = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            const v = this.readByte(addr);
            const result = this.A - v; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < v); this.F |= 0x02;
            this.tstates += 19; return 19;
          }
          
          // DDCB prefixed operations (IX with bit operations)
          case 0xCB: {
            const d = this.readByte(this.PC++);
            const cbOpcode = this.readByte(this.PC++);
            const addr = (this.IX + d) & 0xFFFF;
            
            return this._executeDDCBOperation(cbOpcode, addr);
          }
          
          default:
            // For other DD-prefixed ops, treat as NOP for now
            this.tstates += 8; return 8;
        }
      }

      // FD prefix (IY register operations)
      case 0xFD: {
        const fdOpcode = this.readByte(this.PC++);
        
        switch (fdOpcode) {
          case 0x21: { // LD IY,nn
            this.IY = this.readWordFromPC();
            this.tstates += 14; return 14;
          }
          case 0x2A: { // LD IY,(nn)
            const addr = this.readWordFromPC();
            this.IY = this.readWord(addr);
            this.tstates += 20; return 20;
          }
          case 0x22: { // LD (nn),IY
            const addr = this.readWordFromPC();
            this.writeWord(addr, this.IY);
            this.tstates += 20; return 20;
          }
          case 0xF9: { // LD SP,IY
            this.SP = this.IY;
            this.tstates += 10; return 10;
          }
          case 0xE1: { // POP IY
            this.IY = this.popWord();
            this.tstates += 14; return 14;
          }
          case 0xE5: { // PUSH IY
            this.pushWord(this.IY);
            this.tstates += 15; return 15;
          }
          
          // IY with displacement operations
          case 0x34: { // INC (IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = (this.readByte(addr) + 1) & 0xFF;
            this.writeByte(addr, v);
            this._setFlagZ(v); this._setFlagS(v);
            this.tstates += 23; return 23;
          }
          case 0x35: { // DEC (IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = (this.readByte(addr) - 1) & 0xFF;
            this.writeByte(addr, v);
            this._setFlagZ(v); this._setFlagS(v);
            this.tstates += 23; return 23;
          }
          case 0x36: { // LD (IY+d),n
            const d = this.readByte(this.PC++);
            const n = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, n);
            this.tstates += 19; return 19;
          }
          
          // LD r,(IY+d) operations
          case 0x46: { // LD B,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.B = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x4E: { // LD C,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.C = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x56: { // LD D,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.D = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x5E: { // LD E,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.E = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x66: { // LD H,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.H = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x6E: { // LD L,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.L = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          case 0x7E: { // LD A,(IY+d)
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.A = this.readByte(addr);
            this.tstates += 19; return 19;
          }
          
          // LD (IY+d),r operations
          case 0x70: { // LD (IY+d),B
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.B);
            this.tstates += 19; return 19;
          }
          case 0x71: { // LD (IY+d),C
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.C);
            this.tstates += 19; return 19;
          }
          case 0x72: { // LD (IY+d),D
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.D);
            this.tstates += 19; return 19;
          }
          case 0x73: { // LD (IY+d),E
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.E);
            this.tstates += 19; return 19;
          }
          case 0x74: { // LD (IY+d),H
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.H);
            this.tstates += 19; return 19;
          }
          case 0x75: { // LD (IY+d),L
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.L);
            this.tstates += 19; return 19;
          }
          case 0x77: { // LD (IY+d),A
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            this.writeByte(addr, this.A);
            this.tstates += 19; return 19;
          }
          
          // ADD A,(IY+d)
          case 0x86: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._addA(v);
            this.tstates += 19; return 19;
          }
          
          // ADC A,(IY+d)
          case 0x8E: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._adcA(v);
            this.tstates += 19; return 19;
          }
          
          // SUB A,(IY+d)
          case 0x96: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._subA(v);
            this.tstates += 19; return 19;
          }
          
          // SBC A,(IY+d)
          case 0x9E: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this._sbcA(v);
            this.tstates += 19; return 19;
          }
          
          // AND A,(IY+d)
          case 0xA6: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A &= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // OR A,(IY+d)
          case 0xB6: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A |= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // XOR A,(IY+d)
          case 0xAE: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            this.A ^= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04;
            this.tstates += 19; return 19;
          }
          
          // CP A,(IY+d)
          case 0xBE: {
            const d = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            const v = this.readByte(addr);
            const result = this.A - v; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < v); this.F |= 0x02;
            this.tstates += 19; return 19;
          }
          
          // FDCB prefixed operations (IY with bit operations)
          case 0xCB: {
            const d = this.readByte(this.PC++);
            const cbOpcode = this.readByte(this.PC++);
            const addr = (this.IY + d) & 0xFFFF;
            
            return this._executeFDCBOperation(cbOpcode, addr);
          }
          
          default:
            // For other FD-prefixed ops, treat as NOP for now
            this.tstates += 8; return 8;
        }
      }

      // ED prefix (extended operations)
      case 0xED: {
        const edOpcode = this.readByte(this.PC++);
        switch (edOpcode) {
          // NEG - Negate A (A = 0 - A)
          case 0x44: case 0x4C: case 0x54: case 0x5C: 
          case 0x64: case 0x6C: case 0x74: case 0x7C: { // All NEG variants
            const before = this.A;
            this.A = (0 - before) & 0xFF;
            this._setFlagS(this.A);
            this._setFlagZ(this.A);
            this._setFlagH((before & 0x0F) !== 0); // H set if low nibble was non-zero
            this._setFlagPV(before === 0x80); // P/V set if A was 0x80 (overflow)
            this._setFlagC(before !== 0); // C set if A was non-zero
            this.F |= 0x02; // N = 1 (subtract operation)
            this.tstates += 8; return 8;
          }

          case 0x2A: { // LD HL,(nn)
            const addr = this.readWordFromPC();
            const value = this.readWord(addr);
            this._setHL(value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD HL,(nn)', addr, value, t: this.tstates });
            this.tstates += 16; return 16;
          }
          case 0x22: { // LD (nn),HL
            const addr = this.readWordFromPC();
            const value = this._getHL();
            this.writeWord(addr, value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD (nn),HL', addr, value, t: this.tstates });
            this.tstates += 16; return 16;
          }

          case 0x43: { // LD (nn),BC
            const addr = this.readWordFromPC();
            const value = this._getBC();
            this.writeWord(addr, value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD (nn),BC', addr, value, t: this.tstates });
            this.tstates += 16; return 16;
          }

          case 0x53: { // LD (nn),DE
            const addr = this.readWordFromPC();
            const value = this._getDE();
            this.writeWord(addr, value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD (nn),DE', addr, value, t: this.tstates });
            this.tstates += 16; return 16;
          }

          case 0x63: { // LD (nn),HL (ED version - same as 0x22)
            const addr = this.readWordFromPC();
            const value = this._getHL();
            this.writeWord(addr, value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD (nn),HL', addr, value, t: this.tstates });
            this.tstates += 16; return 16;
          }

          case 0x73: { // LD (nn),SP
            const addr = this.readWordFromPC();
            const value = this.SP;
            this.writeWord(addr, value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD (nn),SP', addr, value, t: this.tstates });
            this.tstates += 20; return 20;
          }

          case 0x4B: { // LD BC,(nn)
            const addr = this.readWordFromPC();
            const value = this.readWord(addr);
            this._setBC(value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD BC,(nn)', addr, value, t: this.tstates });
            this.tstates += 20; return 20;
          }

          case 0x5B: { // LD DE,(nn)
            const addr = this.readWordFromPC();
            const value = this.readWord(addr);
            this._setDE(value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD DE,(nn)', addr, value, t: this.tstates });
            this.tstates += 20; return 20;
          }

          case 0x6B: { // LD HL,(nn) (ED version - same as 0x2A)
            const addr = this.readWordFromPC();
            const value = this.readWord(addr);
            this._setHL(value);
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD HL,(nn)', addr, value, t: this.tstates });
            this.tstates += 20; return 20;
          }

          case 0x7B: { // LD SP,(nn)
            const addr = this.readWordFromPC();
            const value = this.readWord(addr);
            this.SP = value;
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED LD SP,(nn)', addr, value, t: this.tstates });
            this.tstates += 20; return 20;
          }

          case 0x47: { // LD I,A
            this.I = this.A;
            this.tstates += 9; return 9;
          }

          case 0x4F: { // LD R,A
            this.R = this.A;
            this.tstates += 9; return 9;
          }

          case 0x57: { // LD A,I - CRITICAL for boot: copies IFF2 to P/V flag
            this.A = this.I;
            this._setFlagS(this.A);
            this._setFlagZ(this.A);
            this._setFlagH(false); // H = 0
            this.F &= ~0x02; // N = 0
            this._setFlagPV(this.IFF2); // P/V = IFF2 (interrupt state)
            // C flag is unchanged
            this.tstates += 9; return 9;
          }

          case 0x5F: { // LD A,R - also copies IFF2 to P/V flag
            this.A = this.R & 0x7F; // Only lower 7 bits of R
            this._setFlagS(this.A);
            this._setFlagZ(this.A);
            this._setFlagH(false); // H = 0
            this.F &= ~0x02; // N = 0
            this._setFlagPV(this.IFF2); // P/V = IFF2 (interrupt state)
            // C flag is unchanged
            this.tstates += 9; return 9;
          }

          // IM instructions (ED 46, ED 56, ED 5E)
          case 0x46: { // IM 0
            this.IM = 0;
            this.tstates += 8; return 8;
          }

          // Note: 0x56 (IM 1) is already implemented below

          case 0x5E: { // IM 2
            this.IM = 2;
            this.tstates += 8; return 8;
          }

          // ADC HL,rr family
          case 0x4A: { // ADC HL,BC
            this._adcHL(this._getBC());
            this.tstates += 15; return 15;
          }

          case 0x5A: { // ADC HL,DE
            this._adcHL(this._getDE());
            this.tstates += 15; return 15;
          }

          case 0x6A: { // ADC HL,HL
            this._adcHL(this._getHL());
            this.tstates += 15; return 15;
          }

          case 0x7A: { // ADC HL,SP
            this._adcHL(this.SP);
            this.tstates += 15; return 15;
          }

          case 0x42: { // SBC HL,BC
            this._sbcHL(this._getBC());
            this.tstates += 15; return 15;
          }

          case 0x52: { // SBC HL,DE
            this._sbcHL(this._getDE());
            this.tstates += 15; return 15;
          }

          case 0x62: { // SBC HL,HL
            this._sbcHL(this._getHL());
            this.tstates += 15; return 15;
          }

          case 0x72: { // SBC HL,SP
            this._sbcHL(this.SP);
            this.tstates += 15; return 15;
          }

          // IN/OUT (C) instructions (ED 70..71, 78..79)
          case 0x70: { // IN B,(C)
            const port = this._getBC();
            let val = 0xFF;
            if (this.io && typeof this.io.read === 'function') {
              try { val = this.io.read(port) & 0xFF; } catch(e) { val = 0xFF; }
            }
            this.B = val;
            this._setFlagZ(this.B);
            this._setFlagS(this.B);
            // parity (P/V)
            const ones = this.B.toString(2).split('1').length - 1;
            this._setFlagPV((ones % 2) === 0);
            this.F &= ~0x10; // H = 0
            this.F &= ~0x02; // N = 0
            this.tstates += 12; return 12;
          }
          case 0x71: { // OUT (C),B
            const port = this._getBC();
            if (this.io && typeof this.io.write === 'function') {
              try { this.io.write(port, this.B & 0xFF, this.tstates); } catch(e) { /* ignore */ }
            }
            this.tstates += 12; return 12;
          }
          case 0x78: { // IN A,(C)
            const port = this._getBC();
            let val = 0xFF;
            if (this.io && typeof this.io.read === 'function') {
              try { val = this.io.read(port) & 0xFF; } catch(e) { val = 0xFF; }
            }
            this.A = val;
            this._setFlagZ(this.A);
            this._setFlagS(this.A);
            const ones = this.A.toString(2).split('1').length - 1;
            this._setFlagPV((ones % 2) === 0);
            this.F &= ~0x10; // H = 0
            this.F &= ~0x02; // N = 0
            this.tstates += 12; return 12;
          }
          case 0x79: { // OUT (C),A
            const port = this._getBC();
            if (this.io && typeof this.io.write === 'function') {
              try { this.io.write(port, this.A & 0xFF, this.tstates); } catch(e) { /* ignore */ }
            }
            this.tstates += 12; return 12;
          }

          // Return from NMI/IRQ
          case 0x45: { // RETN
            const val = this.popWord();
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED RETN', value: val, sp: this.SP, t: this.tstates });
            this.PC = val;
            this.IFF1 = this.IFF2; // Copy IFF2 to IFF1 on RETN
            this.tstates += 14; return 14;
          }
          case 0x4D: { // RETI
            const val = this.popWord();
            if (this._microTraceEnabled) this._microLog.push({ type: 'ED RETI', value: val, sp: this.SP, t: this.tstates });
            this.PC = val;
            this.IFF1 = this.IFF2;
            this.tstates += 14; return 14;
          }

          // RLD - Rotate digit left between A and (HL)
          case 0x6F: { // RLD
            const hl = this._getHL();
            const memVal = this.readByte(hl);
            const aLow = this.A & 0x0F;
            const result = ((memVal << 4) | aLow) & 0xFF;
            this.writeByte(hl, result);
            this.A = (this.A & 0xF0) | ((memVal >> 4) & 0x0F);
            this._setFlagS(this.A);
            this._setFlagZ(this.A);
            this._setFlagH(false);
            // Set parity flag
            const ones = this.A.toString(2).split('1').length - 1;
            this._setFlagPV((ones % 2) === 0);
            this.F &= ~0x02; // N = 0
            // C flag unchanged
            this.tstates += 18; return 18;
          }

          // RRD - Rotate digit right between A and (HL)
          case 0x67: { // RRD
            const hl = this._getHL();
            const memVal = this.readByte(hl);
            const aLow = this.A & 0x0F;
            const result = ((aLow << 4) | ((memVal >> 4) & 0x0F)) & 0xFF;
            this.writeByte(hl, result);
            this.A = (this.A & 0xF0) | (memVal & 0x0F);
            this._setFlagS(this.A);
            this._setFlagZ(this.A);
            this._setFlagH(false);
            // Set parity flag
            const ones = this.A.toString(2).split('1').length - 1;
            this._setFlagPV((ones % 2) === 0);
            this.F &= ~0x02; // N = 0
            // C flag unchanged
            this.tstates += 18; return 18;
          }

          // IM and miscellaneous ED instructions
          case 0x56: { // IM 1
            this.IM = 1;
            this.tstates += 8; return 8;
          }

          // Block instructions (LDI/LDDR/LDD/LDDR, CPI/CPIR/CPD/CPDR, etc.)
          case 0xA0: // LDI
          case 0xB0: // LDIR
          case 0xA8: // LDD
          case 0xB8: // LDDR
          case 0xA1: // CPI
          case 0xB1: // CPIR
          case 0xA9: // CPD
          case 0xB9: { // CPDR
            // Implement block ops using the register helpers directly to avoid lexical scope issues
            const getBC = () => this._getBC();
            const setBC = v => this._setBC(v);
            const getDE = () => this._getDE();
            const setDE = v => this._setDE(v);
            const getHL = () => this._getHL();
            const setHL = v => this._setHL(v);

            let cycles = 16;
            if (edOpcode === 0xA0 || edOpcode === 0xB0) { // LDI / LDIR
              const val = this.readByte(getHL());
              this.writeByte(getDE(), val);
              setHL((getHL() + 1) & 0xFFFF);
              setDE((getDE() + 1) & 0xFFFF);
              const bc = (getBC() - 1) & 0xFFFF;
              setBC(bc);
              
              // CRITICAL: Proper flag handling for LDI/LDIR
              // C, Z, S unchanged; H=0, N=0; P/V set if BC-1 != 0
              // Undocumented: bits 3 and 5 from (transferred byte + A)
              const n = (val + this.A) & 0xFF;
              // Undocumented bits 3 and 5 come directly from (A + value)
              // Preserve S, Z, and C; clear H/N; set P/V if BC != 0.
              this.F = (this.F & 0xC1) | // Keep C, Z, S (bits 0, 6, 7)
                       (bc !== 0 ? 0x04 : 0) | // P/V set if BC != 0
                       (n & 0x28); // Undocumented bits 3 and 5
              // H and N are cleared (already 0 after masking)
              
              cycles = 16;
              if (edOpcode === 0xB0 && bc !== 0) { // LDIR repeat
                this.PC = (this.PC - 2) & 0xFFFF; // repeat
                cycles += 5;
              }
            } else if (edOpcode === 0xA8 || edOpcode === 0xB8) { // LDD / LDDR
              const val = this.readByte(getHL());
              this.writeByte(getDE(), val);
              setHL((getHL() - 1) & 0xFFFF);
              setDE((getDE() - 1) & 0xFFFF);
              const bc = (getBC() - 1) & 0xFFFF;
              setBC(bc);
              
              // CRITICAL: Proper flag handling for LDD/LDDR (same as LDI/LDIR)
              const n = (val + this.A) & 0xFF;
              // Undocumented bits 3 and 5 come directly from (A + value)
              this.F = (this.F & 0xC1) | // Keep C, Z, S (bits 0, 6, 7)
                       (bc !== 0 ? 0x04 : 0) | // P/V set if BC != 0
                       (n & 0x28); // Undocumented bits 3 and 5
              
              cycles = 16;
              if (edOpcode === 0xB8 && bc !== 0) { // LDDR repeat
                this.PC = (this.PC - 2) & 0xFFFF;
                cycles += 5;
              }
            } else if (edOpcode === 0xA1 || edOpcode === 0xB1) { // CPI / CPIR
              // CPI/CPIR compare without modifying A; C flag is preserved per Z80 spec
              const val = this.readByte(getHL());
              const a = this.A;
              const bc = (getBC() - 1) & 0xFFFF;

              let result = (a - val) & 0xFF;
              const half = (a & 0x0F) < (val & 0x0F);
              const sign = result & 0x80;
              const zero = result === 0;

              // Undocumented bits: if H is set, result is decremented before taking bits 3/5
              const resultForBits = half ? ((result - 1) & 0xFF) : result;

              let f = (this.F & 0x01); // preserve C
              if (sign) f |= 0x80;
              if (zero) f |= 0x40;
              if (half) f |= 0x10;
              if (bc !== 0) f |= 0x04; // P/V = BC != 0
              f |= 0x02; // N = 1
              f |= (resultForBits & 0x28); // undocumented 3/5

              this.F = f;

              setHL((getHL() + 1) & 0xFFFF);
              setBC(bc);
              cycles = 16;
              // CPIR repeats if BC != 0 AND Z flag not set (no match found)
              if (edOpcode === 0xB1 && bc !== 0 && !(this.F & 0x40)) {
                this.PC = (this.PC - 2) & 0xFFFF;
                cycles += 5;
              }
            } else if (edOpcode === 0xA9 || edOpcode === 0xB9) { // CPD / CPDR
              // CPD/CPDR compare without modifying A; C flag is preserved per Z80 spec
              const val = this.readByte(getHL());
              const a = this.A;
              const bc = (getBC() - 1) & 0xFFFF;

              let result = (a - val) & 0xFF;
              const half = (a & 0x0F) < (val & 0x0F);
              const sign = result & 0x80;
              const zero = result === 0;

              // Undocumented bits: if H is set, result is decremented before taking bits 3/5
              const resultForBits = half ? ((result - 1) & 0xFF) : result;

              let f = (this.F & 0x01); // preserve C
              if (sign) f |= 0x80;
              if (zero) f |= 0x40;
              if (half) f |= 0x10;
              if (bc !== 0) f |= 0x04; // P/V = BC != 0
              f |= 0x02; // N = 1
              f |= (resultForBits & 0x28); // undocumented 3/5

              this.F = f;

              setHL((getHL() - 1) & 0xFFFF);
              setBC(bc);
              cycles = 16;
              // CPDR repeats if BC != 0 AND Z flag not set (no match found)
              if (edOpcode === 0xB9 && bc !== 0 && !(this.F & 0x40)) {
                this.PC = (this.PC - 2) & 0xFFFF;
                cycles += 5;
              }
            }

            this.tstates += cycles;
            return cycles;
          }

          case 0x7B: { // LD SP,(nn)
            const addr = this.readWordFromPC();
            const val = this.readWord(addr);
            this.SP = val;
            this.tstates += 20; return 20;
          }

          // Default fallback for unimplemented ED opcodes
          default:
            if (this._debugVerbose && typeof console !== 'undefined' && console.warn) console.warn(`[Z80] Unimplemented ED opcode 0x${edOpcode.toString(16).padStart(2,'0')} at PC=0x${currentPC.toString(16).padStart(4,'0')}`);
            if (this.debugCallback) this.debugCallback(0xED, currentPC);
            this.tstates += 8; return 8;
          }
        }
      }
    }
  }



