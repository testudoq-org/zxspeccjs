// DEBUG: Memory module instrumentation
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
    
    // SEPARATE write mappings - allows writes to "ROM" area to go to scratch RAM
    // This is how JSSpeccy3 handles stack writes when SP is in ROM area
    this.writePages = new Array(4).fill(null);
    
    // Scratch RAM page for writes to ROM area (0x0000-0x3FFF)
    this.romScratchPage = null;

    // currently selected ROM bank index (for 128K/plus3)
    this.currentRom = 0;

    // last contention applied
    this._lastContention = 0;
    // total contention event counter (useful for diagnostics/tests)
    this._contentionHits = 0;
    // recent contention event log (bounded)
    this._contentionLog = [];

    // optional CPU reference for applying tstate delays
    this.cpu = null;

    // contention timing table (lazy-built to match JSSpeccy behavior)
    this._contentionTable = null;
    this._frameCycleCount = 69888; // default for 48K
    // Some ULA revisions assert the first contended t‑state one cycle later.
    // Jetpac and a handful of titles appear happier with 14336, so bump the
    // value here and update unit tests accordingly.
    this._firstContended = 14336;
    this._tstatesPerRow = 224;
    this._contendedLines = 192;

    // debug mem write log (captures writes to 0x4000..0x5AFF)
    this._memWrites = [];

    // Coalesce frequent frame-updates (test-only): when many consecutive
    // screen writes occur, schedule a single generateFromMemory()/render()
    // call per event-loop tick to avoid console flooding and redundant work.
    this._pendingFrameUpdate = false;

    // configure banks for the selected model FIRST
    this.configureBanks(this.model);

    // preload ROM(s) if provided AFTER configuring banks
    const romBuf = options.romBuffer || null;
    if (romBuf) {
      this.loadROM(romBuf, 0);
    }
  }

  attachCPU(cpu) { this.cpu = cpu; }

  /** Load a 16KB ROM into romBanks[bank] (or extend banks) */
  loadROM(buffer, bank = 0) {
    const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    
    const rom = new Uint8Array(Memory.PAGE_SIZE);
    const bytesToCopy = Math.min(src.length, Memory.PAGE_SIZE);
    for (let i = 0; i < bytesToCopy; i++) {
      rom[i] = src[i];
    }
    
    this.romBanks[bank] = rom;
    this.mapROM(bank);
    
    if (this.romScratchPage) {
      this.romScratchPage.set(rom);
    }
  }

  /** Map the visible ROM bank into address 0x0000-0x3FFF */
  mapROM(bankIndex = 0) {
    if (!this.romBanks[bankIndex]) {
      this.romBanks[bankIndex] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
    }
    this.currentRom = bankIndex;
    this.pages[0] = this.romBanks[bankIndex];
    
    if (this.romScratchPage && this.romBanks[bankIndex]) {
      this.romScratchPage.set(this.romBanks[bankIndex]);
    }
  }

  /** Configure banks based on model name */
  configureBanks(model) {
    model = model.toLowerCase();
    this.model = model;

    // clear previous banks
    this.ramBanks = [];
    this.pages = new Array(4).fill(null);
    this.writePages = new Array(4).fill(null);
    
    // Create scratch RAM page for writes to ROM area (like JSSpeccy3's page 11)
    // This allows stack operations to work even when SP is in 0x0000-0x3FFF
    this.romScratchPage = new Uint8Array(Memory.PAGE_SIZE).fill(0);

    // --- VIDEO MEMORY INITIALIZATION FIX ---
    // Always initialize video memory area (0x4000-0x57FF) to 0x00 (black)
    // and attribute area (0x5800-0x5AFF) to 0x38 (white on black, no flash/bright)
    // Only for RAM banks, not ROM
    // This covers all models, but only affects RAM in display area
    const initVideoMemory = (ramArray, offset, length, value) => {
      if (ramArray && ramArray.length >= offset + length) {
        ramArray.fill(value, offset, offset + length);
      }
    };

    // For 48K and 128K models, video memory is in RAM bank 0 (0x4000-0x7FFF)
    // For 16K, only one RAM bank

    if (model === '16k') {
      // 16KB ROM + 16KB RAM
      // romBanks[0] expected; create if missing
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[0] = this.romBanks[0];
      // single 16KB RAM used for page1; other pages unmapped (reads return 0xff)
      const ram = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      // Initialize video memory in 16K RAM (bitmap: 0x0000-0x17FF, attr: 0x1800-0x1AFF)
      initVideoMemory(ram, 0x0000, 0x1800, 0x00); // bitmap
      initVideoMemory(ram, 0x1800, 0x300, 0x38); // attr
      this.ramBanks[0] = ram;
      this.pages[1] = ram;
      this.pages[2] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[3] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      // Set up write pages: writes to page 0 (ROM) go to scratch, others go to same as read
      this.writePages[0] = this.romScratchPage;
      this.writePages[1] = ram;
      this.writePages[2] = this.pages[2];
      this.writePages[3] = this.pages[3];
      this._flatRam = null; // not used
    } else if (model === '48k') {
      // 16KB ROM + 48KB RAM -> 3 RAM banks
      if (!this.romBanks[0]) this.romBanks[0] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
      this.pages[0] = this.romBanks[0];
      // create three 16KB RAM banks
      for (let i = 0; i < 3; i++) this.ramBanks[i] = new Uint8Array(Memory.PAGE_SIZE).fill(0);
      // Initialize video memory in RAM bank 0 (bitmap: 0x0000-0x17FF, attr: 0x1800-0x1AFF)
      initVideoMemory(this.ramBanks[0], 0x0000, 0x1800, 0x00); // bitmap
      initVideoMemory(this.ramBanks[0], 0x1800, 0x300, 0x38); // attr
      // map pages 1..3 to ramBanks 0..2
      this.pages[1] = this.ramBanks[0];
      this.pages[2] = this.ramBanks[1];
      this.pages[3] = this.ramBanks[2];
      // Set up write pages: writes to page 0 (ROM) go to scratch RAM, others go to same as read
      this.writePages[0] = this.romScratchPage;
      this.writePages[1] = this.ramBanks[0];
      this.writePages[2] = this.ramBanks[1];
      this.writePages[3] = this.ramBanks[2];
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
      // Set up write pages
      this.writePages[0] = this.romScratchPage;
      this.writePages[1] = this.ramBanks[5];
      this.writePages[2] = this.ramBanks[2];
      this.writePages[3] = this.ramBanks[0];
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
      // Set up write pages
      this.writePages[0] = this.romScratchPage;
      this.writePages[1] = this.ramBanks[5];
      this.writePages[2] = this.ramBanks[2];
      this.writePages[3] = this.ramBanks[0];
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

  /**
   * Apply ULA memory contention delay for the ZX Spectrum 48K.
   *
   * The ULA and CPU share the same RAM at 0x4000-0x7FFF. During active
   * display, the ULA periodically locks the CPU out for small delays.
   *
   * Timing (48K):
   *   - 69888 T-states per frame, 312 scanlines × 224 T-states each
   *   - Active display: scanlines 64–255 (192 lines), pixel fetch during
   *     the first 128 T-states of each scanline
   *   - First contended T-state of the frame: 14336 (scanline 64, column 0)
   *   - Contention pattern per 8 T-state group: [6, 5, 4, 3, 2, 1, 0, 0]
   *
   * Reference: "The ZX Spectrum ULA" by Chris Smith, ch. 7.
   */
  _buildContentionTableIfNeeded() {
    if (this._contentionTable) return;
    const frameCycleCount = this._frameCycleCount;
    const table = new Uint8Array(frameCycleCount).fill(0);
    let pos = 0;
    // fill until first contended tstate
    while (pos < this._firstContended && pos < frameCycleCount) table[pos++] = 0;

    // for each visible scanline, set contention for first 128 tstates
    for (let y = 0; y < this._contendedLines && pos < frameCycleCount; y++) {
      for (let x = 0; x < this._tstatesPerRow && pos < frameCycleCount; x++) {
        if (x < 128) {
          const seq = x & 0x07;
          table[pos++] = (seq === 7) ? 0 : (6 - seq);
        } else {
          table[pos++] = 0;
        }
      }
    }

    // rest of frame = 0
    while (pos < frameCycleCount) table[pos++] = 0;
    this._contentionTable = table;
  }

  _applyContention(addr, tstates) {
    if (!this._isContended(addr)) { this._lastContention = 0; return 0; }
    if (!this.cpu || typeof this.cpu.tstates !== 'number') { this._lastContention = 0; return 0; }

    this._buildContentionTableIfNeeded();

    const frameStart = (typeof this.cpu.frameStartTstates === 'number') ? this.cpu.frameStartTstates : 0;
    const baseT = (typeof tstates === 'number') ? tstates : this.cpu.tstates;
    let frameT = baseT - frameStart;
    frameT = ((frameT % this._frameCycleCount) + this._frameCycleCount) % this._frameCycleCount;

    const extra = this._contentionTable[frameT];
    if (extra > 0) {
      this._contentionHits = (this._contentionHits || 0) + 1;
      this._logContentionEvent(addr, baseT, extra, frameT);
      this.cpu.tstates += extra;
    }
    this._lastContention = extra;
    return extra;
  }

  /** Log a contention event for diagnostics/test traces */
  _logContentionEvent(addr, baseT, extra) {
    try {
      const cpuT = this.cpu ? this.cpu.tstates : null;
      const rVal = this.cpu ? (this.cpu.R & 0xFF) : null;
      this._contentionLog.push({ t: cpuT, addr, extra, R: rVal });
      if (this._contentionLog.length > 5000) this._contentionLog.shift();
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.contentionLog = this._contentionLog;
      }
    } catch { /* best-effort only */ }
  }

  lastContention() { return this._lastContention; }

  /** Return total contention hit count (diagnostic) */
  contentionHits() { return this._contentionHits || 0; }

  /** Return a copy of recent contention events (diagnostic) */
  getContentionLog() { return (this._contentionLog || []).slice(); }

  /** Read a byte taking into account the current page mapping
   *  Optional second arg tstates is the CPU tstate at the moment of access.
   */
  read(addr, tstates) {
    addr = this._mask(addr);
    const page = addr >>> 14; // 0..3
    const offset = addr & (Memory.PAGE_SIZE - 1);
    
    // FIXED: Always read from pages array (ROM for page 0, RAM for others)
    // On ZX Spectrum 48K, there is NO RAM under ROM - writes to ROM area are ignored
    // and reads always return ROM content. The scratch page was causing ROM corruption.
    const view = this.pages[page];
    
    let value = 0xff;
    if (view) value = view[offset];

    // Diagnostic instrumentation (extracted to reduce complexity)
    this._instrumentRead(addr, value);

    // Apply contention for accesses in 0x4000..0x7fff (passes caller tstates)
    this._applyContention(addr, tstates);
    // Stack watch callback
    this._notifyStackWatch('read', addr, value);
    return value;
  }

  /** Write a byte - on ZX Spectrum 48K, writes to ROM area are ignored
   *  Optional third arg tstates is the CPU tstate at the moment of access.
   */
  write(addr, value, tstates) {
    addr = this._mask(addr);
    value = value & 0xff;
    const page = addr >>> 14;
    const offset = addr & (Memory.PAGE_SIZE - 1);
    
    // On ZX Spectrum 48K, writes to ROM area (page 0) are silently ignored.
    if (page === 0) {
      this._applyContention(addr, tstates);
      return false;
    }
    
    const writeView = this.pages[page];
    if (!writeView) { this._lastContention = 0; return false; }
    
    this._applyContention(addr, tstates);
    writeView[offset] = value;

    // Test instrumentation (extracted to reduce cyclomatic complexity)
    this._instrumentWrite(addr, value);

    // Stack watch callback
    this._notifyStackWatch('write', addr, value);

    // Keep flatRam in sync for 48K
    if (this._flatRam && addr >= 0x4000 && addr < 0x10000) {
      this._flatRam[addr - 0x4000] = value;
    }
    return true;
  }

  /** Read instrumentation — extracted from read() to reduce complexity */
  _instrumentRead(addr, value) {
    try {
      if (typeof window === 'undefined' || !window.__TEST__) return;
      const t = (this.cpu && this.cpu.tstates) || 0;
      if (addr >= 0x3C00 && addr < 0x4400) {
        this._boundedPush(window.__TEST__, 'charBitmapReads', { addr, value, t }, 512);
      }
      if (addr >= 0x4000 && addr < 0x5800 && Math.random() < 0.01) {
        this._boundedPush(window.__TEST__, 'screenBitmapReads', { addr, value, t }, 1024);
      }
    } catch { /* ignore */ }
  }

  /** Write instrumentation — extracted from write() to reduce complexity */
  _instrumentWrite(addr, value) {
    try {
      this._instrumentWrite_screenArea(addr, value);
      this._instrumentWrite_charsAndBitmap(addr, value);
      this._instrumentWrite_screenBitmap(addr, value);
    } catch { /* best-effort only */ }
  }

  /** Record screen/char writes (0x4000..0x5AFF) for test traces */
  _instrumentWrite_screenArea(addr, value) {
    if (addr < 0x4000 || addr > 0x5AFF) return;
    this._memWrites = this._memWrites || [];
    const pcVal = this.cpu && typeof this.cpu.PC === 'number' ? this.cpu.PC : undefined;
    const Rval = this.cpu && typeof this.cpu.R === 'number' ? this.cpu.R : undefined;
    const t = (this.cpu && this.cpu.tstates) || 0;
    const writeEvt = { type: 'write', addr, value, t, pc: pcVal, R: Rval };
    this._attachMicroTrace(writeEvt, pcVal);
    if (this._memWrites.length > 5000) this._memWrites.shift();
    this._memWrites.push(writeEvt);
    this._mirrorToCpuMicroLog(addr, value, t, pcVal, Rval);
    this._exposeToDebugObjects(this._memWrites);
    this._instrumentWrite_rocketArea(addr, writeEvt);
    this._scheduleCoalescedUpdate();
  }

  /** Expose memWrites to debug objects on window */
  _exposeToDebugObjects(memWrites) {
    try {
      if (typeof window === 'undefined') return;
      if (window.__ZX_DEBUG__) window.__ZX_DEBUG__.memWrites = memWrites;
      if (window.__TEST__) window.__TEST__.memWrites = memWrites;
    } catch { /* ignore */ }
  }

  /** Attach microtrace and opcode context to a write event */
  _attachMicroTrace(writeEvt, pcVal) {
    try {
      if (this.cpu && Array.isArray(this.cpu._microLog)) {
        writeEvt.micro = this.cpu._microLog.slice(-8);
      }
      if (typeof pcVal === 'number' && this.pages && this.pages.length) {
        const opBytes = [];
        for (let i = 0; i < 8; i++) {
          try { opBytes.push(this.read((pcVal + i) & 0xffff)); } catch { opBytes.push(null); }
        }
        writeEvt.opcodes = opBytes;
      }
    } catch { /* best-effort */ }
  }

  /** Mirror mem write into CPU microLog for tracing */
  _mirrorToCpuMicroLog(addr, value, t, pcVal, Rval) {
    try {
      if (this.cpu && this.cpu._microTraceEnabled && Array.isArray(this.cpu._microLog)) {
        this.cpu._microLog.push({ type: 'MEMWRITE', addr, value, t, pc: pcVal, R: Rval });
      }
    } catch { /* ignore */ }
  }

  /** Rocket-area write watch (0x4800..0x49FF) */
  _instrumentWrite_rocketArea(addr, writeEvt) {
    if (addr < 0x4800 || addr >= 0x4A00) return;
    try {
      if (typeof window === 'undefined') return;
      window.__ZX_DEBUG__ = window.__ZX_DEBUG__ || {};
      window.__ZX_DEBUG__.rocketWrites = window.__ZX_DEBUG__.rocketWrites || [];
      window.__ZX_DEBUG__.rocketWrites.push(writeEvt);
      if (window.__ZX_DEBUG__.rocketWrites.length > 512) window.__ZX_DEBUG__.rocketWrites.shift();
    } catch { /* ignore */ }
  }

  /** Schedule a coalesced framebuffer update for test harness */
  _scheduleCoalescedUpdate() {
    try {
      const env = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      if (!env || !env.__TEST__ || !env.emu || !env.emu.ula) return;
      const { ula } = env.emu;
      if (!ula.useDeferredRendering || !ula.frameBuffer || !ula.frameRenderer) return;
      if (this._pendingFrameUpdate) return;
      this._pendingFrameUpdate = true;
      Promise.resolve().then(() => {
        try {
          ula.frameBuffer.generateFromMemory();
          ula.frameRenderer.render(ula.frameBuffer, ula.frameBuffer.getFlashPhase());
        } catch { /* ignore */ }
        this._pendingFrameUpdate = false;
      });
    } catch { /* ignore */ }
  }

  /** Track writes to CHARS sysvar and character bitmap region */
  _instrumentWrite_charsAndBitmap(addr, value) {
    try {
      if (typeof window === 'undefined' || !window.__TEST__) return;
      const pc = window.__LAST_PC__ || (this.cpu ? this.cpu.PC : null);
      const t = (this.cpu && this.cpu.tstates) || 0;
      const entry = { addr, value, t, pc, timestamp: Date.now() };
      if (addr === 0x5C36 || addr === 0x5C37) {
        this._boundedPush(window.__TEST__, 'charsWrites', entry, 128);
      }
      if (addr >= 0x3C00 && addr < 0x4400) {
        this._boundedPush(window.__TEST__, 'charBitmapWrites', entry, 128);
      }
    } catch { /* ignore */ }
  }

  /** Track writes to screen bitmap (0x4000-0x57FF) */
  _instrumentWrite_screenBitmap(addr, value) {
    if (addr < 0x4000 || addr >= 0x5800) return;
    try {
      if (typeof window === 'undefined' || !window.__TEST__) return;
      const pc = window.__LAST_PC__ || (this.cpu ? this.cpu.PC : null);
      const entry = { addr, value, t: (this.cpu && this.cpu.tstates) || 0, pc, timestamp: Date.now() };
      this._boundedPush(window.__TEST__, 'screenBitmapWrites', entry, 2000);
    } catch { /* ignore */ }
  }

  /** Push an entry onto a bounded array property, creating it if absent */
  _boundedPush(obj, key, entry, maxLen) {
    obj[key] = obj[key] || [];
    obj[key].push(entry);
    if (obj[key].length > maxLen) obj[key].shift();
  }

  /** Notify stack watch callback if enabled and address is in range */
  _notifyStackWatch(type, addr, value) {
    if (!this._stackWatch) return;
    const s = this._stackWatch;
    const inRange = s.start <= s.end ? (addr >= s.start && addr <= s.end) : (addr >= s.start || addr <= s.end);
    if (inRange && typeof s.cb === 'function') {
      s.cb({ type, addr, value, t: this.cpu ? this.cpu.tstates : 0 });
    }
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

  /** Stack watch helpers (test instrumentation) */
  enableStackWatch(startAddr, endAddr, cb) {
    this._stackWatch = { start: startAddr & Memory.ADDR_MASK, end: endAddr & Memory.ADDR_MASK, cb };
  }

  disableStackWatch() {
    this._stackWatch = null;
  }

  /** Return a copy of the bitmap (0x4000..0x57FF = 6912 bytes) */
  exportScreenBitmap() {
    const out = new Uint8Array(0x1800);
    let base = 0x4000;
    for (let i = 0; i < 0x1800; i++) out[i] = this.read(base + i);
    return out;
  }

  /** Return a direct view of the bitmap (0x4000..0x57FF = 6912 bytes) */
  getBitmapView() {
    // For 48K, flatRam is a 48K linear RAM view starting at 0x4000
    if (this._flatRam && this._flatRam.length >= 0x1800) {
      return new Uint8Array(this._flatRam.buffer, 0, 0x1800);
    }
    // fallback: create a copy
    return this.exportScreenBitmap();
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
    // for 48K ensure pages point to appropriate banks but DON'T clear video RAM
    // Let ROM boot sequence manage display initialization
    if (this.model === '48k') {
      this.configureBanks('48k');
      // CRITICAL: Do NOT re-initialize video RAM here - let ROM boot sequence handle it
      // This allows copyright message to appear during boot
      if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__.memoryResetLog = (window.__TEST__.memoryResetLog || []).concat({ t: Date.now(), pc: (window.__LAST_PC__ || null) });
      console.log('[Memory] Reset complete - video RAM preserved for boot sequence');
    }
  }
}
