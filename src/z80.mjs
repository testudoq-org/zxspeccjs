/* eslint-env browser */
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

    // Interrupt request line
    this.intRequested = false;

    // Debug callback
    this.debugCallback = null;
    
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
        window.__PC_WATCHER__ = { history: [] };
      }
      
      // Add PC to history if changed
      const history = window.__PC_WATCHER__.history;
      if (!history.length || history[history.length - 1] !== pc) {
        history.push(pc);
        // Keep history manageable (avoid memory bloat) - reduced for test stability
        if (history.length > 1000) {
          history.shift();
        }
        
        // Verbose logging for instruction execution verification
        if (this._debugVerbose && typeof console !== 'undefined' && console.log) {
          console.log(`[Z80] PC: 0x${pc.toString(16).padStart(4, '0')} (instruction count: ${history.length})`);
        }
      }
      
      // Track boot progression
      if (this._bootAddresses.includes(pc)) {
        this._visitedBootAddresses.add(pc);
        // Boot address logging disabled to prevent memory issues in tests
        // if (typeof console !== 'undefined' && console.log) {
        //   console.log(`[Z80] Boot address 0x${pc.toString(16).padStart(4, '0')} reached (${this._visitedBootAddresses.size}/${this._bootAddresses.length})`);
        // }
        
        // Check for boot completion (final address 0x11CB)
        if (pc === 0x11CB && typeof window.__ZX_DEBUG__ !== 'undefined') {
          window.__ZX_DEBUG__.bootComplete = true;
          if (window.__ZX_DEBUG__.bootComplete && typeof window.__ZX_DEBUG__.bootComplete === 'function') {
            window.__ZX_DEBUG__.bootComplete();
          }
          // Boot completion logging disabled to prevent memory issues
          // if (typeof console !== 'undefined' && console.log) {
          //   console.log('[Z80] Boot sequence complete!');
          // }
        }
      }
    } else {
      // Fallback for non-browser environments (Node.js, headless testing)
      this._fallbackPC = pc;
      if (this._debugVerbose && typeof console !== 'undefined' && console.log) {
        console.log(`[Z80-FALLBACK] PC: 0x${pc.toString(16).padStart(4, '0')}`);
      }
    }
  }

  // Execute instructions for a specified number of t-states
  runFor(targetTstates) {
    const startTstates = this.tstates;
    const target = startTstates + targetTstates;
    
    while (this.tstates < target) {
      const consumed = this.step();
      this.tstates += consumed;
    }
  }

  reset() {
    this.A = this.F = this.B = this.C = this.D = this.E = this.H = this.L = 0;
    
    // Reset alternate register set
    this.A_ = this.F_ = this.B_ = this.C_ = this.D_ = this.E_ = this.H_ = this.L_ = 0;
    
    this.PC = 0x0000;
    this.SP = 0xFFFF;
    this.IX = 0x0000;
    this.IY = 0x0000;
    this.I = 0;
    this.R = 0;
    this.IFF1 = this.IFF2 = false; // CRITICAL: Keep interrupts disabled initially
    this.IM = 1; // Use interrupt mode 1
    this.tstates = 0;
    this.intRequested = false;
    
    // Reset boot tracking
    this._visitedBootAddresses.clear();
    
    // Don't call debug hooks during reset to maintain clean state
    // The debug state will be cleared by the emulator's reset method
  }

  // Helpers
  _getAF() { return (this.A << 8) | (this.F & 0xff); }
  _setAF(v) { this.A = (v >> 8) & 0xff; this.F = v & 0xff; }
  _getBC() { return (this.B << 8) | this.C; }
  _setBC(v) { this.B = (v >> 8) & 0xff; this.C = v & 0xff; }
  _getDE() { return (this.D << 8) | this.E; }
  _setDE(v) { this.D = (v >> 8) & 0xff; this.E = v & 0xff; }
  _getHL() { return (this.H << 8) | this.L; }
  _setHL(v) { this.H = (v >> 8) & 0xff; this.L = v & 0xff; }

  readByte(addr) { return this.mem.read(addr & 0xffff) & 0xff; }
  writeByte(addr, value) { this.mem.write(addr & 0xffff, value & 0xff); }

  readWord(addr) {
    // little-endian
    const lo = this.readByte(addr);
    const hi = this.readByte((addr + 1) & 0xffff);
    return (hi << 8) | lo;
  }

  readWordFromPC() {
    // Read 16-bit immediate value from PC and increment PC by 2
    const addr = this.PC;
    this.PC = (this.PC + 2) & 0xffff;
    return this.readWord(addr);
  }

  writeWord(addr, value) {
    // little-endian
    this.writeByte(addr, value & 0xff);
    this.writeByte((addr + 1) & 0xffff, (value >> 8) & 0xff);
  }

  pushWord(value) {
    this.SP = (this.SP - 1) & 0xffff; this.writeByte(this.SP, (value >> 8) & 0xff);
    this.SP = (this.SP - 1) & 0xffff; this.writeByte(this.SP, value & 0xff);
  }

  popWord() {
    const lo = this.readByte(this.SP); this.SP = (this.SP + 1) & 0xffff;
    const hi = this.readByte(this.SP); this.SP = (this.SP + 1) & 0xffff;
    return (hi << 8) | lo;
  }

  // Flag helpers
  _setFlagZ(v) { if (v === 0) this.F |= 0x40; else this.F &= ~0x40; }
  _setFlagS(v) { if (v & 0x80) this.F |= 0x80; else this.F &= ~0x80; }
  _setFlagC(v) { if (v) this.F |= 0x01; else this.F &= ~0x01; }
  _setFlagP(v) { if (v) this.F |= 0x04; else this.F &= ~0x04; }

  // Simple parity calculation
  _parity(v) {
    v = v & 0xff;
    let p = 0;
    for (let i = 0; i < 8; i++) if (v & (1 << i)) p++;
    return (p % 2) === 0;
  }

  // Arithmetic operations
  _addA(value) {
    const oldA = this.A;
    this.A = (this.A + value) & 0xFF;
    this._setFlagZ(this.A);
    this._setFlagS(this.A);
    this._setFlagC(oldA + value > 0xFF);
    this.F &= ~0x10; // H flag calculation would be more complex
    this.F &= ~0x02; // N flag reset
  }

  _adcA(value) {
    const oldA = this.A;
    const carry = this.F & 0x01 ? 1 : 0;
    this.A = (this.A + value + carry) & 0xFF;
    this._setFlagZ(this.A);
    this._setFlagS(this.A);
    this._setFlagC(oldA + value + carry > 0xFF);
    this.F &= ~0x10; // H flag calculation would be more complex
    this.F &= ~0x02; // N flag reset
  }

  _subA(value) {
    const oldA = this.A;
    this.A = (this.A - value) & 0xFF;
    this._setFlagZ(this.A);
    this._setFlagS(this.A);
    this._setFlagC(oldA < value);
    this.F |= 0x10; // H flag calculation would be more complex
    this.F |= 0x02; // N flag set
  }

  _sbcA(value) {
    const oldA = this.A;
    const carry = this.F & 0x01 ? 1 : 0;
    this.A = (this.A - value - carry) & 0xFF;
    this._setFlagZ(this.A);
    this._setFlagS(this.A);
    this._setFlagC(oldA < value + carry);
    this.F |= 0x10; // H flag calculation would be more complex
    this.F |= 0x02; // N flag set
  }

  // Request an interrupt (called by ULA / external)
  requestInterrupt() { this.intRequested = true; }

  // Execute DDCB prefixed operations (IX with bit operations)
  _executeDDCBOperation(cbOpcode, addr) {
    const originalValue = this.readByte(addr);
    
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
        // For other bit operations, implement as needed
        this.tstates += 23; return 23;
    }
  }

  // Execute FDCB prefixed operations (IY with bit operations)
  _executeFDCBOperation(cbOpcode, addr) {
    const originalValue = this.readByte(addr);
    
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
        // For other bit operations, implement as needed
        this.tstates += 23; return 23;
    }
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

  // Execute a single instruction and return t-states consumed
  step() {
    // Handle interrupts (very basic IM 1)
    if (this.intRequested && this.IFF1) {
      this.IFF1 = false; this.IFF2 = false;
      // maskable interrupt: push PC and jump to 0x0038
      this.pushWord(this.PC);
      this.PC = 0x0038;
      this.intRequested = false;
      const consumed = 13; // typical RST/INT cost approximation
      this.tstates += consumed;
      
      // Ensure reliable PC tracking for interrupts - ALWAYS call debug hooks
      this._updateDebugHooks(this.PC);
      if (this.debugCallback) {
        this.debugCallback(0xFF, this.PC - consumed); // Interrupt opcode approximation
      }
      return consumed;
    }

    const currentPC = this.PC;
    const opcode = this.readByte(this.PC++);
    
    // CRITICAL: ALWAYS call debug hooks for reliable PC tracking
    this._updateDebugHooks(currentPC);
    
    // Track debug execution if debug callback is set
    if (this.debugCallback) {
      this.debugCallback(opcode, currentPC);
    }
    
    // Additional PC update after instruction execution for current PC value
    this._updateDebugHooks(this.PC);

    switch (opcode) {
      case 0x00: // NOP
        this.tstates += 4; return 4;

      // LD r,n : load immediate into various registers
      case 0x3E: // LD A,n
        this.A = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x06: // LD B,n
        this.B = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x0E: // LD C,n
        this.C = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x16: // LD D,n
        this.D = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x1E: // LD E,n
        this.E = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x26: // LD H,n
        this.H = this.readByte(this.PC++);
        this.tstates += 7; return 7;
      case 0x2E: // LD L,n
        this.L = this.readByte(this.PC++);
        this.tstates += 7; return 7;

      // LD BC,nn
      case 0x01: {
        const nn = this.readWordFromPC();
        this._setBC(nn);
        this.tstates += 10; return 10;
      }
      // LD DE,nn
      case 0x11: {
        const nn = this.readWordFromPC();
        this._setDE(nn);
        this.tstates += 10; return 10;
      }
      // LD HL,nn
      case 0x21: {
        const nn = this.readWordFromPC();
        this._setHL(nn);
        this.tstates += 10; return 10;
      }
      // LD SP,nn
      case 0x31: {
        const nn = this.readWordFromPC();
        this.SP = nn;
        this.tstates += 10; return 10;
      }

      // INC r
      case 0x3C: this.A = (this.A + 1) & 0xFF; this._setFlagZ(this.A); this._setFlagS(this.A); this.tstates += 4; return 4;
      case 0x04: this.B = (this.B + 1) & 0xFF; this._setFlagZ(this.B); this._setFlagS(this.B); this.tstates += 4; return 4;
      case 0x0C: this.C = (this.C + 1) & 0xFF; this._setFlagZ(this.C); this._setFlagS(this.C); this.tstates += 4; return 4;
      case 0x14: this.D = (this.D + 1) & 0xFF; this._setFlagZ(this.D); this._setFlagS(this.D); this.tstates += 4; return 4;
      case 0x1C: this.E = (this.E + 1) & 0xFF; this._setFlagZ(this.E); this._setFlagS(this.E); this.tstates += 4; return 4;
      case 0x24: this.H = (this.H + 1) & 0xFF; this._setFlagZ(this.H); this._setFlagS(this.H); this.tstates += 4; return 4;
      case 0x2C: this.L = (this.L + 1) & 0xFF; this._setFlagZ(this.L); this._setFlagS(this.L); this.tstates += 4; return 4;

      // DEC r
      case 0x3D: this.A = (this.A - 1) & 0xFF; this._setFlagZ(this.A); this._setFlagS(this.A); this.tstates += 4; return 4;
      case 0x05: this.B = (this.B - 1) & 0xFF; this._setFlagZ(this.B); this._setFlagS(this.B); this.tstates += 4; return 4;
      case 0x0D: this.C = (this.C - 1) & 0xFF; this._setFlagZ(this.C); this._setFlagS(this.C); this.tstates += 4; return 4;
      case 0x15: this.D = (this.D - 1) & 0xFF; this._setFlagZ(this.D); this._setFlagS(this.D); this.tstates += 4; return 4;
      case 0x1D: this.E = (this.E - 1) & 0xFF; this._setFlagS(this.E); this.tstates += 4; return 4;
      case 0x25: this.H = (this.H - 1) & 0xFF; this._setFlagZ(this.H); this._setFlagS(this.H); this.tstates += 4; return 4;
      case 0x2D: this.L = (this.L - 1) & 0xFF; this._setFlagZ(this.L); this._setFlagS(this.L); this.tstates += 4; return 4;

      // INC (HL)
      case 0x34: {
        const addr = this._getHL();
        const v = (this.readByte(addr) + 1) & 0xFF;
        this.writeByte(addr, v);
        this._setFlagZ(v); this._setFlagS(v);
        this.tstates += 11; return 11;
      }

      // DEC (HL)
      case 0x35: {
        const addr = this._getHL();
        const v = (this.readByte(addr) - 1) & 0xFF;
        this.writeByte(addr, v);
        this._setFlagZ(v); this._setFlagS(v);
        this.tstates += 11; return 11;
      }

      // AND A, r
      case 0xA7: this.A &= this.A; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA0: this.A &= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA1: this.A &= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA2: this.A &= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA3: this.A &= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA4: this.A &= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA5: this.A &= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA6: { const v = this.readByte(this._getHL()); this.A &= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F |= 0x10; this.F &= ~0x04; this.tstates += 7; return 7; }

      // OR A, r
      case 0xB7: this.A |= this.A; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB0: this.A |= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB1: this.A |= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB2: this.A |= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB3: this.A |= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB4: this.A |= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB5: this.A |= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xB6: { const v = this.readByte(this._getHL()); this.A |= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 7; return 7; }

      // XOR A, r
      case 0xAF: this.A ^= this.A; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA8: this.A ^= this.B; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xA9: this.A ^= this.C; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xAA: this.A ^= this.D; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xAB: this.A ^= this.E; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xAC: this.A ^= this.H; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xAD: this.A ^= this.L; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 4; return 4;
      case 0xAE: { const v = this.readByte(this._getHL()); this.A ^= v; this._setFlagZ(this.A); this._setFlagS(this.A); this.F &= ~0x10; this.F &= ~0x04; this.tstates += 7; return 7; }

      // CP r
      case 0xBF: { const result = this.A - this.A; this._setFlagZ(result & 0xFF); this._setFlagS(result & 0xFF); this._setFlagC(this.A < this.A); this.F |= 0x02; this.tstates += 4; return 4; }
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

      // EX AF,AF' (0x08) - Exchange AF with AF'
      case 0x08: { 
        const tempA = this.A; this.A = this.A_; this.A_ = tempA;
        const tempF = this.F; this.F = this.F_; this.F_ = tempF;
        this.tstates += 4; return 4;
      }

      // EXX (0xD9) - Exchange BC/DE/HL with BC'/DE'/HL'
      case 0xD9: {
        // Exchange BC with BC'
        const tempB = this.B; this.B = this.B_; this.B_ = tempB;
        const tempC = this.C; this.C = this.C_; this.C_ = tempC;
        
        // Exchange DE with DE'
        const tempD = this.D; this.D = this.D_; this.D_ = tempD;
        const tempE = this.E; this.E = this.E_; this.E_ = tempE;
        
        // Exchange HL with HL'
        const tempH = this.H; this.H = this.H_; this.H_ = tempH;
        const tempL = this.L; this.L = this.L_; this.L_ = tempL;
        
        this.tstates += 4; return 4;
      }

      // LD r,r - register to register loads
      case 0x7F: this.A = this.A; this.tstates += 4; return 4; // LD A,A
      case 0x78: this.A = this.B; this.tstates += 4; return 4; // LD A,B
      case 0x79: this.A = this.C; this.tstates += 4; return 4; // LD A,C
      case 0x7A: this.A = this.D; this.tstates += 4; return 4; // LD A,D
      case 0x7B: this.A = this.E; this.tstates += 4; return 4; // LD A,E
      case 0x7C: this.A = this.H; this.tstates += 4; return 4; // LD A,H
      case 0x7D: this.A = this.L; this.tstates += 4; return 4; // LD A,L
      // LD (HL), r operations (0x70-0x77 are used for memory, not register loads)
      case 0x47: this.B = this.A; this.tstates += 4; return 4; // LD B,A
      case 0x41: this.B = this.C; this.tstates += 4; return 4; // LD B,C
      case 0x42: this.B = this.D; this.tstates += 4; return 4; // LD B,D
      case 0x43: this.B = this.E; this.tstates += 4; return 4; // LD B,E
      case 0x44: this.B = this.H; this.tstates += 4; return 4; // LD B,H
      case 0x45: this.B = this.L; this.tstates += 4; return 4; // LD B,L
      case 0x4F: this.C = this.A; this.tstates += 4; return 4; // LD C,A
      case 0x48: this.C = this.B; this.tstates += 4; return 4; // LD C,B
      case 0x4A: this.C = this.D; this.tstates += 4; return 4; // LD C,D
      case 0x4B: this.C = this.E; this.tstates += 4; return 4; // LD C,E
      case 0x4C: this.C = this.H; this.tstates += 4; return 4; // LD C,H
      case 0x4D: this.C = this.L; this.tstates += 4; return 4; // LD C,L
      case 0x57: this.D = this.A; this.tstates += 4; return 4; // LD D,A
      case 0x50: this.D = this.B; this.tstates += 4; return 4; // LD D,B
      case 0x51: this.D = this.C; this.tstates += 4; return 4; // LD D,C
      case 0x53: this.D = this.E; this.tstates += 4; return 4; // LD D,E
      case 0x54: this.D = this.H; this.tstates += 4; return 4; // LD D,H
      case 0x55: this.D = this.L; this.tstates += 4; return 4; // LD D,L
      case 0x5F: this.E = this.A; this.tstates += 4; return 4; // LD E,A
      case 0x58: this.E = this.B; this.tstates += 4; return 4; // LD E,B
      case 0x59: this.E = this.C; this.tstates += 4; return 4; // LD E,C
      case 0x5A: this.E = this.D; this.tstates += 4; return 4; // LD E,D
      case 0x5C: this.E = this.H; this.tstates += 4; return 4; // LD E,H
      case 0x5D: this.E = this.L; this.tstates += 4; return 4; // LD E,L
      case 0x67: this.H = this.A; this.tstates += 4; return 4; // LD H,A
      case 0x60: this.H = this.B; this.tstates += 4; return 4; // LD H,B
      case 0x61: this.H = this.C; this.tstates += 4; return 4; // LD H,C
      case 0x62: this.H = this.D; this.tstates += 4; return 4; // LD H,D
      case 0x63: this.H = this.E; this.tstates += 4; return 4; // LD H,E
      case 0x65: this.H = this.L; this.tstates += 4; return 4; // LD H,L
      case 0x6F: this.L = this.A; this.tstates += 4; return 4; // LD L,A
      case 0x68: this.L = this.B; this.tstates += 4; return 4; // LD L,B
      case 0x69: this.L = this.C; this.tstates += 4; return 4; // LD L,C
      case 0x6A: this.L = this.D; this.tstates += 4; return 4; // LD L,D
      case 0x6B: this.L = this.E; this.tstates += 4; return 4; // LD L,E
      case 0x6C: this.L = this.H; this.tstates += 4; return 4; // LD L,H

      // ADD A, r
      case 0x80: this._addA(this.B); this.tstates += 4; return 4; // ADD A,B
      case 0x81: this._addA(this.C); this.tstates += 4; return 4; // ADD A,C
      case 0x82: this._addA(this.D); this.tstates += 4; return 4; // ADD A,D
      case 0x83: this._addA(this.E); this.tstates += 4; return 4; // ADD A,E
      case 0x84: this._addA(this.H); this.tstates += 4; return 4; // ADD A,H
      case 0x85: this._addA(this.L); this.tstates += 4; return 4; // ADD A,L
      case 0x86: { const v = this.readByte(this._getHL()); this._addA(v); this.tstates += 7; return 7; } // ADD A,(HL)
      case 0x87: this._addA(this.A); this.tstates += 4; return 4; // ADD A,A

      // ADC A, r (Add with carry)
      case 0x88: this._adcA(this.B); this.tstates += 4; return 4; // ADC A,B
      case 0x89: this._adcA(this.C); this.tstates += 4; return 4; // ADC A,C
      case 0x8A: this._adcA(this.D); this.tstates += 4; return 4; // ADC A,D
      case 0x8B: this._adcA(this.E); this.tstates += 4; return 4; // ADC A,E
      case 0x8C: this._adcA(this.H); this.tstates += 4; return 4; // ADC A,H
      case 0x8D: this._adcA(this.L); this.tstates += 4; return 4; // ADC A,L
      case 0x8E: { const v = this.readByte(this._getHL()); this._adcA(v); this.tstates += 7; return 7; } // ADC A,(HL)
      case 0x8F: this._adcA(this.A); this.tstates += 4; return 4; // ADC A,A

      // SUB r
      case 0x90: this._subA(this.B); this.tstates += 4; return 4; // SUB A,B
      case 0x91: this._subA(this.C); this.tstates += 4; return 4; // SUB A,C
      case 0x92: this._subA(this.D); this.tstates += 4; return 4; // SUB A,D
      case 0x93: this._subA(this.E); this.tstates += 4; return 4; // SUB A,E
      case 0x94: this._subA(this.H); this.tstates += 4; return 4; // SUB A,H
      case 0x95: this._subA(this.L); this.tstates += 4; return 4; // SUB A,L
      case 0x96: { const v = this.readByte(this._getHL()); this._subA(v); this.tstates += 7; return 7; } // SUB A,(HL)
      case 0x97: this._subA(this.A); this.tstates += 4; return 4; // SUB A,A

      // SBC A, r (Subtract with carry)
      case 0x98: this._sbcA(this.B); this.tstates += 4; return 4; // SBC A,B
      case 0x99: this._sbcA(this.C); this.tstates += 4; return 4; // SBC A,C
      case 0x9A: this._sbcA(this.D); this.tstates += 4; return 4; // SBC A,D
      case 0x9B: this._sbcA(this.E); this.tstates += 4; return 4; // SBC A,E
      case 0x9C: this._sbcA(this.H); this.tstates += 4; return 4; // SBC A,H
      case 0x9D: this._sbcA(this.L); this.tstates += 4; return 4; // SBC A,L
      case 0x9E: { const v = this.readByte(this._getHL()); this._sbcA(v); this.tstates += 7; return 7; } // SBC A,(HL)
      case 0x9F: this._sbcA(this.A); this.tstates += 4; return 4; // SBC A,A

      // JP nn
      case 0xC3: {
        const addr = this.readWordFromPC();
        this.PC = addr;
        this.tstates += 10; return 10;
      }
      
      // JP cc,nn - conditional jumps
      case 0xC2: { // JP NZ,nn
        const addr = this.readWordFromPC();
        if (!(this.F & 0x40)) this.PC = addr;
        this.tstates += 10; return 10;
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
        this.PC = addr;
        this.tstates += 17; return 17;
      }
      
      // Memory operations with BC and DE
      case 0x02: this.writeByte(this._getBC(), this.A); this.tstates += 7; return 7; // LD (BC), A
      case 0x0A: this.A = this.readByte(this._getBC()); this.tstates += 7; return 7; // LD A, (BC)
      case 0x12: this.writeByte(this._getDE(), this.A); this.tstates += 7; return 7; // LD (DE), A
      case 0x1A: this.A = this.readByte(this._getDE()); this.tstates += 7; return 7; // LD A, (DE)

      // RET
      case 0xC9: {
        this.PC = this.popWord();
        this.tstates += 10; return 10;
      }

      // Memory ops: LD (HL), r
      case 0x70: this.writeByte(this._getHL(), this.B); this.tstates += 7; return 7; // LD (HL), B
      case 0x71: this.writeByte(this._getHL(), this.C); this.tstates += 7; return 7; // LD (HL), C
      case 0x72: this.writeByte(this._getHL(), this.D); this.tstates += 7; return 7; // LD (HL), D
      case 0x73: this.writeByte(this._getHL(), this.E); this.tstates += 7; return 7; // LD (HL), E
      case 0x74: this.writeByte(this._getHL(), this.H); this.tstates += 7; return 7; // LD (HL), H
      case 0x75: this.writeByte(this._getHL(), this.L); this.tstates += 7; return 7; // LD (HL), L
      case 0x77: this.writeByte(this._getHL(), this.A); this.tstates += 7; return 7; // LD (HL), A
      
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

      // LD (nn), A -> 0x32
      case 0x32: {
        const addr = this.readWordFromPC();
        this.writeByte(addr, this.A);
        this.tstates += 13; return 13;
      }

      // LD A,(nn) -> 0x3A
      case 0x3A: {
        const addr = this.readWordFromPC();
        this.A = this.readByte(addr);
        this.tstates += 13; return 13;
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

      // RST instructions
      case 0xc7: this.pushWord(this.PC); this.PC = 0x00; this.tstates += 11; return 11;
      case 0xcf: this.pushWord(this.PC); this.PC = 0x08; this.tstates += 11; return 11;
      case 0xd7: this.pushWord(this.PC); this.PC = 0x10; this.tstates += 11; return 11;
      case 0xdf: this.pushWord(this.PC); this.PC = 0x18; this.tstates += 11; return 11;
      case 0xe7: this.pushWord(this.PC); this.PC = 0x20; this.tstates += 11; return 11;
      case 0xef: this.pushWord(this.PC); this.PC = 0x28; this.tstates += 11; return 11;
      case 0xf7: this.pushWord(this.PC); this.PC = 0x30; this.tstates += 11; return 11;
      case 0xff: this.pushWord(this.PC); this.PC = 0x38; this.tstates += 11; return 11;

      // 16-bit arithmetic operations
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

      case 0x19: { // ADD HL,DE
        const hl = this._getHL();
        const de = this._getDE();
        const result = (hl + de) & 0xFFFF;
        
        this._setFlagC((hl + de) > 0xFFFF);
        this._setFlagZ(result === 0);
        this._setFlagS(result & 0x8000);
        
        this._setHL(result);
        this.tstates += 11; return 11;
      }

      case 0x29: { // ADD HL,HL
        const hl = this._getHL();
        const result = (hl + hl) & 0xFFFF;
        
        this._setFlagC((hl + hl) > 0xFFFF);
        this._setFlagZ(result === 0);
        this._setFlagS(result & 0x8000);
        
        this._setHL(result);
        this.tstates += 11; return 11;
      }

      case 0x39: { // ADD HL,SP
        const hl = this._getHL();
        const sp = this.SP;
        const result = (hl + sp) & 0xFFFF;
        
        this._setFlagC((hl + sp) > 0xFFFF);
        this._setFlagZ(result === 0);
        this._setFlagS(result & 0x8000);
        
        this._setHL(result);
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
            case 0x2A: { // LD HL,(nn) - 16-bit memory load
              const addr = this.readWordFromPC();
              const value = this.readWord(addr);
              this._setHL(value);
              this.tstates += 16; return 16;
            }
            
            case 0x22: { // LD (nn),HL - 16-bit memory store
              const addr = this.readWordFromPC();
              this.writeWord(addr, this._getHL());
              this.tstates += 16; return 16;
            }
            
            default:
              // For other ED-prefixed ops, treat as NOP for now
              this.tstates += 8; return 8;
        }
      }

      // CB prefix (bit operations)
      case 0xCB: {
        const cbOpcode = this.readByte(this.PC++);
        
        switch (cbOpcode) {
          // RLC operations
          case 0x00: this.B = this._rlc(this.B); this.tstates += 8; return 8; // RLC B
          case 0x01: this.C = this._rlc(this.C); this.tstates += 8; return 8; // RLC C
          case 0x02: this.D = this._rlc(this.D); this.tstates += 8; return 8; // RLC D
          case 0x03: this.E = this._rlc(this.E); this.tstates += 8; return 8; // RLC E
          case 0x04: this.H = this._rlc(this.H); this.tstates += 8; return 8; // RLC H
          case 0x05: this.L = this._rlc(this.L); this.tstates += 8; return 8; // RLC L
          case 0x06: { const addr = this._getHL(); this.writeByte(addr, this._rlc(this.readByte(addr))); this.tstates += 15; return 15; } // RLC (HL)
          case 0x07: this.A = this._rlc(this.A); this.tstates += 8; return 8; // RLC A
          
          // RRC operations
          case 0x08: this.B = this._rrc(this.B); this.tstates += 8; return 8; // RRC B
          case 0x09: this.C = this._rrc(this.C); this.tstates += 8; return 8; // RRC C
          case 0x0A: this.D = this._rrc(this.D); this.tstates += 8; return 8; // RRC D
          case 0x0B: this.E = this._rrc(this.E); this.tstates += 8; return 8; // RRC E
          case 0x0C: this.H = this._rrc(this.H); this.tstates += 8; return 8; // RRC H
          case 0x0D: this.L = this._rrc(this.L); this.tstates += 8; return 8; // RRC L
          case 0x0E: { const addr = this._getHL(); this.writeByte(addr, this._rrc(this.readByte(addr))); this.tstates += 15; return 15; } // RRC (HL)
          case 0x0F: this.A = this._rrc(this.A); this.tstates += 8; return 8; // RRC A
          
          default:
            // For other CB-prefixed ops, treat as NOP for now
            this.tstates += 8; return 8;
        }
      }
      
      default:
        // Unknown opcode - treat as NOP for now
        // console.log(`Unknown opcode: 0x${opcode.toString(16).padStart(2, '0')} at PC 0x${(this.PC-1).toString(16).padStart(4, '0')}`);
        this.tstates += 4; return 4;
    }
  }
}
