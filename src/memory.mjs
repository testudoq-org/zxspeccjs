export class Memory {
  // Page size and mask
  static PAGE_SIZE = 0x4000; // 16KB
  static ADDR_MASK = 0xffff;

  /**
   * Construct a Memory instance supporting multiple Spectrum models.
   * options: {
   *   model: '16k'|'48k'|'128k'|'plus3' (default '48k'),
   *   contention: boolean (default true),
   *   romBuffer: ArrayBuffer|Uint8Array|Array of buffers for multi-ROM
   * }
   */
  constructor(options = {}) {
    this.model = (options.model || '48k').toLowerCase();
    this.contentionEnabled = options.contention !== false;

    // ROM banks (each 16KB). For single ROM use romBanks[0].
    this.romBanks = [];
    // RAM banks (each 16KB) used by 128K/+3 models
    this.ramBanks = [];

    // linear view for small models kept for compatibility
    this._flatRam = null;

    // current mappings (4 pages of 16KB each) - each page is Uint8Array view
    this.pages = new Array(4).fill(null);

    // currently selected ROM bank index (for 128K/plus3)
    this.currentRom = 0;

    // last contention applied
    this._lastContention = 0;

    // optional CPU reference for applying tstate delays
    this.cpu = null;

    // preload ROM(s) if provided
    const romBuf = options.romBuffer || null;
    if (romBuf) {
      if (Array.isArray(romBuf)) {
        romBuf.forEach((b, i) => this.loadROM(b, i));
      } else {
        this.loadROM(romBuf, 0);
      }
    }

    // configure banks for the selected model
    this.configureBanks(this.model);
  }

  attachCPU(cpu) { this.cpu = cpu; }

  /** Load a 16KB ROM into romBanks[bank] (or extend banks) */
  loadROM(buffer, bank = 0) {
    const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const rom = new Uint8Array(Memory.PAGE_SIZE);
    rom.fill(0xff);
    rom.set(src.subarray(0, Math.min(src.length, Memory.PAGE_SIZE)));
    this.romBanks[bank] = rom;
    // ensure mapping uses this bank if requested
    if (bank === this.currentRom) this.mapROM(bank);
  }

  /** Map the visible ROM bank into address 0x0000-0x3FFF */
  mapROM(bankIndex = 0) {
    if (!this.romBanks[bankIndex]) {
      // create an empty ROM bank if missing
      this.romBanks[bankIndex] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
    }
    this.currentRom = bankIndex;
    this.pages[0] = this.romBanks[bankIndex];
  }

  /** Configure banks based on model name */
  configureBanks(model) {
    model = model.toLowerCase();
    this.model = model;

    // clear previous banks
    this.ramBanks = [];
    this.pages = new Array(4).fill(null);

    if (model === '16k') {
      // 16KB ROM + 16KB RAM
      // romBanks[0] expected; create if missing
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[0] = this.romBanks[0];
      // single 16KB RAM used for page1; other pages unmapped (reads return 0xff)
      const ram = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      this.ramBanks[0] = ram;
      this.pages[1] = ram;
      this.pages[2] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[3] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this._flatRam = null; // not used
    } else if (model === '48k') {
      // 16KB ROM + 48KB RAM -> 3 RAM banks
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[0] = this.romBanks[0];
      // create three 16KB RAM banks
      for (let i = 0; i < 3; i++) this.ramBanks[i] = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      // map pages 1..3 to ramBanks 0..2
      this.pages[1] = this.ramBanks[0];
      this.pages[2] = this.ramBanks[1];
      this.pages[3] = this.ramBanks[2];
      // flatRam for backward-compatibility (ram starting at 0x4000)
      this._flatRam = new Uint8Array(0xC000);
      // fill flatRam with page1..3
      this._syncFlatRamFromBanks();
    } else if (model === '128k' || model === 'plus2' || model === '+2') {
      // 128KB RAM + multiple ROM banks
      // ensure at least one ROM bank exists
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      // create 8 RAM banks of 16KB
      for (let i = 0; i < 8; i++) this.ramBanks[i] = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      // default 128K power-on mapping (common convention):
      // page0 = current ROM, page1 = RAM bank 5, page2 = RAM bank 2, page3 = RAM bank 0
      this.pages[0] = this.romBanks[this.currentRom] || this.romBanks[0];
      this.pages[1] = this.ramBanks[5];
      this.pages[2] = this.ramBanks[2];
      this.pages[3] = this.ramBanks[0];
      this._flatRam = null;
    } else if (model === 'plus3' || model === '+3') {
      // +3 (Spectrum +3) - similar to 128K but different ROM layout expectations (CP/M support)
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      // 128KB RAM
      for (let i = 0; i < 8; i++) this.ramBanks[i] = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      // typical +3 default mapping: ROM0 at page0, RAM pages similar to 128K
      this.pages[0] = this.romBanks[this.currentRom] || this.romBanks[0];
      this.pages[1] = this.ramBanks[5];
      this.pages[2] = this.ramBanks[2];
      this.pages[3] = this.ramBanks[0];
      this._flatRam = null;
    } else {
      // fallback to 48K behaviour
      return this.configureBanks('48k');
    }

    // ensure ROM mapping is in sync
    this.mapROM(this.currentRom);
  }

  /** Sync a flat 48K linear RAM view from ramBanks (used for ULA convenience) */
  _syncFlatRamFromBanks() {
    if (!this._flatRam) return;
    // flatRam length 0xC000 starting at 0x4000
    // page1 -> offset 0x0000, page2 -> 0x4000, page3 -> 0x8000
    this._flatRam.set(this.pages[1], 0x0000);
    this._flatRam.set(this.pages[2], 0x4000);
    this._flatRam.set(this.pages[3], 0x8000);
  }

  /** Helper: mask to 16-bit address */
  _mask(addr) { return addr & Memory.ADDR_MASK; }

  _isContended(addr) {
    addr = this._mask(addr);
    // classic contended region is 0x4000-0x7fff
    if (!this.contentionEnabled) return false;
    return addr >= 0x4000 && addr <= 0x7fff;
  }

  _applyContention(addr) {
    if (!this._isContended(addr)) { this._lastContention = 0; return 0; }
    let extra = 1;
    if (this.cpu && typeof this.cpu.tstates === 'number') {
      const t = this.cpu.tstates & 0xff;
      extra = (t % 7) === 0 ? 6 : ((t % 3) === 0 ? 2 : 1);
      this.cpu.tstates += extra;
    }
    this._lastContention = extra;
    return extra;
  }

  lastContention() { return this._lastContention; }

  /** Read a byte taking into account the current page mapping */
  read(addr) {
    addr = this._mask(addr);
    const page = addr >>> 14; // 0..3
    const offset = addr & (Memory.PAGE_SIZE - 1);
    const view = this.pages[page];
    let value = 0xff;
    if (view) value = view[offset];
    // Apply contention for accesses in 0x4000..0x7fff
    this._applyContention(addr);
    return value;
  }

  /** Write a byte to the currently mapped RAM (writes to ROM are ignored) */
  write(addr, value) {
    addr = this._mask(addr);
    value = value & 0xff;
    const page = addr >>> 14;
    const offset = addr & (Memory.PAGE_SIZE - 1);
    const view = this.pages[page];
    if (!view) { this._lastContention = 0; return false; }
    // If the page points to a ROM bank that's considered read-only, ignore writes
    if (this.romBanks.includes(view)) {
      this._lastContention = 0;
      return false;
    }
    view[offset] = value;
    this._applyContention(addr);
    // if we maintain a flatRam for 48K keep it in sync
    if (this._flatRam) {
      if (addr >= 0x4000 && addr < 0x10000) {
        this._flatRam[addr - 0x4000] = value;
      }
    }
    return true;
  }

  readWord(addr) {
    const lo = this.read(addr);
    const hi = this.read((addr + 1) & Memory.ADDR_MASK);
    return (hi << 8) | lo;
  }

  writeWord(addr, value) {
    this.write(addr, value & 0xff);
    this.write((addr + 1) & Memory.ADDR_MASK, (value >> 8) & 0xff);
  }

  /** Return a copy of the bitmap (0x4000..0x57FF = 6912 bytes) */
  exportScreenBitmap() {
    const out = new Uint8Array(0x1800);
    let base = 0x4000;
    for (let i = 0; i < 0x1800; i++) out[i] = this.read(base + i);
    return out;
  }

  /** Return attribute area (0x5800..0x5AFF = 768 bytes) */
  getAttributeView() {
    const out = new Uint8Array(768);
    const base = 0x5800;
    for (let i = 0; i < 768; i++) out[i] = this.read(base + i);
    return out;
  }

  /** Convenience: map a RAM page (0..3) to a ram bank index (for 128K models) */
  mapRAMPage(pageIndex, ramBankIndex) {
    if (pageIndex < 0 || pageIndex > 3) return false;
    if (!this.ramBanks[ramBankIndex]) return false;
    this.pages[pageIndex] = this.ramBanks[ramBankIndex];
    // keep flatRam in sync if used
    if (this._flatRam) this._syncFlatRamFromBanks();
    return true;
  }

  /** Reset RAM and optionally ROM mapping */
  reset() {
    // clear all ram banks
    for (let i = 0; i < this.ramBanks.length; i++) this.ramBanks[i].fill(0);
    if (this._flatRam) this._flatRam.fill(0);
    this._lastContention = 0;
    // reset to default rom mapping
    this.mapROM(this.currentRom);
    // for 48K ensure pages point to appropriate banks
    if (this.model === '48k') this.configureBanks('48k');
  }
}
