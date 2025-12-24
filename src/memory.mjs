export class Memory {
  /**
   * Memory model for 48K ZX Spectrum: 16KB ROM + 48KB RAM
   * romBuffer: ArrayBuffer or Uint8Array with ROM contents (optional)
   * options: { contention: boolean }
   */
  constructor(romBuffer = null, options = {}) {
    this.ROM_SIZE = 0x4000; // 16KB
    this.RAM_SIZE = 0xC000; // 48KB (0x10000 - 0x4000)

    this.rom = new Uint8Array(this.ROM_SIZE);
    if (romBuffer) this.loadROM(romBuffer);

    this.ram = new Uint8Array(this.RAM_SIZE);
    this.reset();

    // contention simulation
    this.contentionEnabled = options.contention !== false;
    this._lastContention = 0;

    // optional CPU attachment so memory can increment cpu.tstates on contended accesses
    this.cpu = null;
  }

  /** Attach a Z80 CPU instance so memory can apply contention delays directly */
  attachCPU(cpu) {
    this.cpu = cpu;
  }

  /** Load ROM from an ArrayBuffer or Uint8Array */
  loadROM(buffer) {
    const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const len = Math.min(src.length, this.ROM_SIZE);
    this.rom.fill(0);
    this.rom.set(src.subarray(0, len));
  }

  /** Reset RAM to all zeros (typical power-on state) */
  reset() {
    this.ram.fill(0);
    this._lastContention = 0;
  }

  /** Helper: mask address to 16-bit space */
  _mask(addr) { return addr & 0xffff; }

  /** Is this a contended address region (ULA memory area)?
   * Classic 48K contention affects accesses to 0x4000-0x7FFF (screen & color RAM sit inside this)
   */
  _isContended(addr) {
    addr = this._mask(addr);
    return addr >= 0x4000 && addr <= 0x7fff && this.contentionEnabled;
  }

  /** Apply a simple contention model. If a CPU is attached, increment cpu.tstates.
   * The model is intentionally lightweight: it adds small extra tstate delays for
   * accesses inside the contended region. This can be improved later with a
   * per-line 224 T-state contention table for cycle-accurate emulation.
   */
  _applyContention(addr) {
    if (!this._isContended(addr)) { this._lastContention = 0; return 0; }

    // Determine extra cycles. If CPU attached, derive from current tstate to vary delay.
    let extra = 1; // minimum 1 extra tstate for contended access
    if (this.cpu && typeof this.cpu.tstates === 'number') {
      // coarse model: depending on current tstate modulo a scanline length, vary delay
      const t = this.cpu.tstates & 0xff; // coarse phase
      // add 0-6 extra cycles in a simple repeating pattern to emulate contention bursts
      extra = (t % 7) === 0 ? 6 : ((t % 3) === 0 ? 2 : 1);
      this.cpu.tstates += extra; // apply directly to CPU timing
    }

    this._lastContention = extra;
    return extra;
  }

  /** Return last contention cycles added by the previous access */
  lastContention() { return this._lastContention; }

  /** Read a byte from memory with proper wrapping and contention simulation */
  read(addr) {
    addr = this._mask(addr);
    let value;
    if (addr < this.ROM_SIZE) {
      value = this.rom[addr];
      // ROM is not contended on the original 48K Spectrum for addresses 0x0000-0x3FFF
      this._lastContention = 0;
    } else {
      value = this.ram[addr - this.ROM_SIZE];
      // apply contention if needed (screen/ULA region)
      this._applyContention(addr);
    }
    return value;
  }

  /** Write a byte to RAM (ROM is read-only). Returns whether write succeeded. */
  write(addr, value) {
    addr = this._mask(addr);
    value = value & 0xff;
    if (addr < this.ROM_SIZE) {
      // writes to ROM are ignored
      this._lastContention = 0;
      return false;
    }
    this.ram[addr - this.ROM_SIZE] = value;
    this._applyContention(addr);
    return true;
  }

  /** Helpers to retrieve views for ULA rendering and attribute access */
  getBitmapView() {
    // bitmap is 0x4000..0x57FF (6912 bytes)
    return this.ram.subarray(0x0000, 0x1800); // ram offset 0x4000 -> index 0
  }

  getAttributeView() {
    // attributes are 0x5800..0x5AFF (768 bytes)
    return this.ram.subarray(0x1800, 0x1800 + 768);
  }

  /** Convenience: readWord little-endian */
  readWord(addr) {
    const lo = this.read(addr);
    const hi = this.read((addr + 1) & 0xffff);
    return (hi << 8) | lo;
  }

  /** Convenience: writeWord little-endian */
  writeWord(addr, value) {
    this.write(addr, value & 0xff);
    this.write((addr + 1) & 0xffff, (value >> 8) & 0xff);
  }

  /** Expose a linear copy of screen bitmap arranged as CPU memory (useful for ULA) */
  exportScreenBitmap() {
    // return a copy to avoid external mutation
    return new Uint8Array(this.getBitmapView());
  }
}
