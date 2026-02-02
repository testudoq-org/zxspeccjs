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

    // optional CPU reference for applying tstate delays
    this.cpu = null;

    // debug mem write log (captures writes to 0x4000..0x5AFF)
    this._memWrites = [];

    // configure banks for the selected model FIRST
    this.configureBanks(this.model);

    // preload ROM(s) if provided AFTER configuring banks
    const romBuf = options.romBuffer || null;
    if (romBuf) {
      console.log('[Memory] Constructor: Loading ROM buffer, size:', romBuf.length || 'unknown');
      if (Array.isArray(romBuf)) {
        // Handle both regular arrays and Uint8Array - load as single ROM
        this.loadROM(romBuf, 0);
      } else {
        this.loadROM(romBuf, 0);
      }
    }
  }

  attachCPU(cpu) { this.cpu = cpu; }

  /** Load a 16KB ROM into romBanks[bank] (or extend banks) */
  loadROM(buffer, bank = 0) {
    console.log(`[Memory] loadROM called with buffer type: ${buffer.constructor.name}, length: ${buffer.length || 'unknown'}`);
    
    let src;
    if (buffer instanceof Uint8Array) {
      // If it's already a Uint8Array, use it directly
      src = buffer;
      console.log(`[Memory] Using existing Uint8Array, first 10 bytes:`, Array.from(src.slice(0, 10)));
    } else {
      // Otherwise, convert to Uint8Array
      src = new Uint8Array(buffer);
      console.log(`[Memory] Converted to Uint8Array, first 10 bytes:`, Array.from(src.slice(0, 10)));
    }
    
    // Create a new ROM array and copy data properly
    const rom = new Uint8Array(Memory.PAGE_SIZE);
    
    // Copy the ROM data using the proven working method from direct memory test
    const bytesToCopy = Math.min(src.length, Memory.PAGE_SIZE);
    console.log(`[Memory] Copying ${bytesToCopy} bytes from src to ROM array`);
    for (let i = 0; i < bytesToCopy; i++) {
      rom[i] = src[i];
    }
    
    console.log(`[Memory] After copy, ROM first 10 bytes:`, Array.from(rom.slice(0, 10)));
    
    // Store the ROM bank
    this.romBanks[bank] = rom;
    
    // CRITICAL FIX: Always update the page mapping to point to the new ROM
    this.mapROM(bank);
    
    // Also copy ROM to scratch page so stack operations work correctly
    // This mimics having "shadow RAM" under the ROM - reads return ROM code,
    // writes go to scratch, and stack reads return what was written
    if (this.romScratchPage) {
      this.romScratchPage.set(rom);
      console.log(`[Memory] Copied ROM to scratch page for shadow RAM functionality`);
    }
    
    console.log(`[Memory] Loaded ROM into bank ${bank}, mapped to pages[0], first byte: 0x${this.romBanks[bank][0].toString(16).padStart(2, '0')}`);
    
    // Verify the mapping worked
    console.log(`[Memory] Verification: pages[0][0] = ${this.pages[0][0]}`);

    // Diagnostic: dump ROM bytes around where the copyright glyph is expected
    try {
      if (this.romBanks[bank] && this.romBanks[bank].length > 0x0EA0) {
        if (typeof console !== 'undefined' && console.log) {
          console.log('[Memory] ROM bytes 0x0E90-0x0EA0:', Array.from(this.romBanks[bank].slice(0x0E90, 0x0EA0)).map(b=>b.toString(16).padStart(2,'0')));
        }
      }
      // Also dump the ROM region containing the builtin copyright text (0x1530-0x1550)
      if (this.romBanks[bank] && this.romBanks[bank].length > 0x1550) {
        if (typeof console !== 'undefined' && console.log) {
          console.log('[Memory] ROM bytes 0x1530-0x1550:', Array.from(this.romBanks[bank].slice(0x1530, 0x1550)).map(b=>b.toString(16).padStart(2,'0')));
        }
      }
    } catch (e) { /* ignore */ }
  }

  /** Map the visible ROM bank into address 0x0000-0x3FFF */
  mapROM(bankIndex = 0) {
    if (!this.romBanks[bankIndex]) {
      // create an empty ROM bank if missing
      this.romBanks[bankIndex] = new Uint8Array(Memory.PAGE_SIZE).fill(0xff);
    }
    this.currentRom = bankIndex;
    this.pages[0] = this.romBanks[bankIndex];
    
    // Also update scratch page with ROM content for shadow RAM functionality
    if (this.romScratchPage && this.romBanks[bankIndex]) {
      this.romScratchPage.set(this.romBanks[bankIndex]);
    }
    
    console.log(`[Memory] Mapped ROM bank ${bankIndex} to pages[0], first byte: 0x${this.romBanks[bankIndex][0].toString(16).padStart(2, '0')}`);
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
    
    // FIXED: Always read from pages array (ROM for page 0, RAM for others)
    // On ZX Spectrum 48K, there is NO RAM under ROM - writes to ROM area are ignored
    // and reads always return ROM content. The scratch page was causing ROM corruption.
    const view = this.pages[page];
    
    let value = 0xff;
    if (view) value = view[offset];

    // Diagnostic: instrument reads to character bitmap and screen bitmap regions for debugging
    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        // Log reads to ROM charset/copy area (0x3C00..0x4400)
        if (addr >= 0x3C00 && addr < 0x4400) {
          window.__TEST__.charBitmapReads = window.__TEST__.charBitmapReads || [];
          window.__TEST__.charBitmapReads.push({ addr, value, t: (this.cpu && this.cpu.tstates) || 0 });
          if (window.__TEST__.charBitmapReads.length > 512) window.__TEST__.charBitmapReads.shift();
        }
        // Log reads to screen bitmap (0x4000..0x57FF)
        if (addr >= 0x4000 && addr < 0x5800) {
          window.__TEST__.screenBitmapReads = window.__TEST__.screenBitmapReads || [];
          // sample to avoid huge logs
          if (window.__TEST__.screenBitmapReads.length === 0 || Math.random() < 0.01) {
            window.__TEST__.screenBitmapReads.push({ addr, value, t: (this.cpu && this.cpu.tstates) || 0 });
            if (window.__TEST__.screenBitmapReads.length > 1024) window.__TEST__.screenBitmapReads.shift();
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Apply contention for accesses in 0x4000..0x7fff
    this._applyContention(addr);
    // If stack watch enabled and access falls in range, invoke callback
    if (this._stackWatch) {
      const s = this._stackWatch;
      // Handle wrap-around ranges (start > end) by normalising check
      const inRange = s.start <= s.end ? (addr >= s.start && addr <= s.end) : (addr >= s.start || addr <= s.end);
      if (inRange && typeof s.cb === 'function') s.cb({ type: 'read', addr, value, t: this.cpu ? this.cpu.tstates : 0 });
    }
    return value;
  }

  /** Write a byte - on ZX Spectrum 48K, writes to ROM area are ignored */
  write(addr, value) {
    addr = this._mask(addr);
    value = value & 0xff;
    const page = addr >>> 14;
    const offset = addr & (Memory.PAGE_SIZE - 1);
    
    // FIXED: On ZX Spectrum 48K, writes to ROM area (page 0) are silently ignored
    // There is no RAM under ROM on the 48K model. The writePages approach was wrong
    // because it allowed stack operations to corrupt the scratch page which was
    // then being read for code execution.
    if (page === 0) {
      // ROM area - ignore write but still apply contention
      this._applyContention(addr);
      return false;
    }
    
    // For RAM pages (1-3), write normally
    const writeView = this.pages[page]; // Use pages directly, not writePages
    if (!writeView) { this._lastContention = 0; return false; }
    
    writeView[offset] = value;
    this._applyContention(addr);

    // Diagnostic: warn on accidental writes to CHARS (0x5C36/0x5C37)
    if (addr === 0x5C36 || addr === 0x5C37) {
      const stack = (new Error()).stack;
      const pc = (typeof window !== 'undefined' && window.__LAST_PC__) ? window.__LAST_PC__ : (this.cpu ? this.cpu.PC : null);
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[Memory] Write to CHARS at 0x${addr.toString(16)} = 0x${value.toString(16)} (t=${this.cpu && this.cpu.tstates ? this.cpu.tstates : 'unknown'}, pc=0x${pc ? pc.toString(16) : 'unknown'})`);
        console.warn(stack);
      }
      try {
        if (typeof window !== 'undefined' && window.__TEST__) {
          window.__TEST__.charsWrites = window.__TEST__.charsWrites || [];
          window.__TEST__.charsWrites.push({ addr, value, t: (this.cpu && this.cpu.tstates) || 0, pc, stack, timestamp: Date.now() });
          if (window.__TEST__.charsWrites.length > 128) window.__TEST__.charsWrites.shift();
        }
      } catch (e) { /* ignore */ }
    }

    // Instrument writes to character bitmap region (0x3C00-0x43FF = 1024 bytes, 128 chars * 8 bytes)
    // This covers the ROM character set area and potential RAM copies
    if (addr >= 0x3C00 && addr < 0x4400) {
      const pc = (typeof window !== 'undefined' && window.__LAST_PC__) ? window.__LAST_PC__ : (this.cpu ? this.cpu.PC : null);
      const stack = (new Error()).stack;
      try {
        if (typeof window !== 'undefined' && window.__TEST__) {
          window.__TEST__.charBitmapWrites = window.__TEST__.charBitmapWrites || [];
          window.__TEST__.charBitmapWrites.push({ addr, value, t: (this.cpu && this.cpu.tstates) || 0, pc, stack, timestamp: Date.now() });
          if (window.__TEST__.charBitmapWrites.length > 128) window.__TEST__.charBitmapWrites.shift();
        }
      } catch (e) { /* ignore */ }
    }

    // Instrument writes to screen bitmap (0x4000-0x57FF) to track character rendering
    if (addr >= 0x4000 && addr < 0x5800) {
      const pc = (typeof window !== 'undefined' && window.__LAST_PC__) ? window.__LAST_PC__ : (this.cpu ? this.cpu.PC : null);
      try {
        if (typeof window !== 'undefined' && window.__TEST__) {
          window.__TEST__.screenBitmapWrites = window.__TEST__.screenBitmapWrites || [];
          // Only log if it's not too frequent (sample every 100th write to avoid overflow)
          if (window.__TEST__.screenBitmapWrites.length === 0 || 
              (window.__TEST__.screenBitmapWrites.length < 1000 && Math.random() < 0.01)) {
            window.__TEST__.screenBitmapWrites.push({ addr, value, t: (this.cpu && this.cpu.tstates) || 0, pc, timestamp: Date.now() });
          }
        }
      } catch (e) { /* ignore */ }
    }

    // If stack watch enabled and access falls in range, invoke callback
    if (this._stackWatch) {
      const s = this._stackWatch;
      const inRange = s.start <= s.end ? (addr >= s.start && addr <= s.end) : (addr >= s.start || addr <= s.end);
      if (inRange && typeof s.cb === 'function') s.cb({ type: 'write', addr, value, t: this.cpu ? this.cpu.tstates : 0 });
    }
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
