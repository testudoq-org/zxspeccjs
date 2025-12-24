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

    // 16-bit registers
    this.PC = 0x0000;
    this.SP = 0xFFFF;

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
  }

  reset() {
    this.A = this.F = this.B = this.C = this.D = this.E = this.H = this.L = 0;
    this.PC = 0x0000;
    this.SP = 0xFFFF;
    this.I = 0;
    this.R = 0;
    this.IFF1 = this.IFF2 = false;
    this.IM = 0;
    this.tstates = 0;
    this.intRequested = false;
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

  // Request an interrupt (called by ULA / external)
  requestInterrupt() { this.intRequested = true; }

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
      return consumed;
    }

    const opcode = this.readByte(this.PC++);

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

      // LD A, r
      case 0x7F: this.A = this.A; this.tstates += 4; return 4;
      case 0x78: this.A = this.B; this.tstates += 4; return 4;
      case 0x79: this.A = this.C; this.tstates += 4; return 4;
      case 0x7A: this.A = this.D; this.tstates += 4; return 4;
      case 0x7B: this.A = this.E; this.tstates += 4; return 4;
      case 0x7C: this.A = this.H; this.tstates += 4; return 4;
      case 0x7D: this.A = this.L; this.tstates += 4; return 4;

      // ADD A, r
      case 0x80: this._addA(this.B); this.tstates += 4; return 4;
      case 0x81: this._addA(this.C); this.tstates += 4; return 4;
      case 0x82: this._addA(this.D); this.tstates += 4; return 4;
      case 0x83: this._addA(this.E); this.tstates += 4; return 4;
      case 0x86: { const v = this.readByte(this._getHL()); this._addA(v); this.tstates += 7; return 7; }

      // SUB r (simple subset)
      case 0x90: this._subA(this.B); this.tstates += 4; return 4;

      // JP nn
      case 0xC3: {
        const addr = this.readWordFromPC();
        this.PC = addr;
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

      // CALL nn
      case 0xCD: {
        const addr = this.readWordFromPC();
        this.pushWord(this.PC);
        this.PC = addr;
        this.tstates += 17; return 17;
      }

      // RET
      case 0xC9: {
        this.PC = this.popWord();
        this.tstates += 10; return 10;
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
      default:
        // Unsupported opcode: treat as NOP for safety but log once
        console.warn(`Z80: unimplemented opcode 0x${opcode.toString(16).padStart(2,'0')} at PC=${(this.PC-1).toString(16)}`);
        this.tstates += 4; return 4;
    }
  }

  // Read a 16-bit immediate from PC and advance PC
  readWordFromPC() {
    const lo = this.readByte(this.PC++);
    const hi = this.readByte(this.PC++);
    return (hi << 8) | lo;
  }

  // Arithmetic helpers
  _addA(value) {
    const a = this.A;
    const result = (a + value) & 0xff;
    // flags: S Z H P/V N C (approximate)
    this._setFlagS(result);
    this._setFlagZ(result);
    // half-carry
    if (((a & 0x0f) + (value & 0x0f)) & 0x10) this.F |= 0x10; else this.F &= ~0x10;
    // carry
    this._setFlagC((a + value) > 0xff);
    // parity/overflow (approximate)
    this._setFlagP(((a ^ ~value) & (a ^ result) & 0x80) !== 0);
    this.F &= ~0x02; // N = 0
    this.A = result;
  }

  _subA(value) {
    const a = this.A;
    const result = (a - value) & 0xff;
    this._setFlagS(result);
    this._setFlagZ(result);
    // half-borrow
    if (((a & 0x0f) - (value & 0x0f)) & 0x10) this.F |= 0x10; else this.F &= ~0x10;
    this._setFlagC(a < value);
    this._setFlagP(((a ^ value) & (a ^ result) & 0x80) !== 0);
    this.F |= 0x02; // N = 1
    this.A = result;
  }

  // Run for up to tstates budget (useful for frame stepping)
  runFor(tstatesBudget) {
    let consumed = 0;
    while (consumed < tstatesBudget) {
      const used = this.step();
      consumed += used;
    }
    return consumed;
  }
}
