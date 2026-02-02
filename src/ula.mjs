// ULA graphics emulation for ZX Spectrum 48K (ES6 module)
import { FrameBuffer, FrameRenderer } from './frameBuffer.mjs';

export class ULA {
  constructor(memory, canvas, options = {}) {
    this.mem = memory; // instance of Memory
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    console.log('[ULA] constructor: memory', memory, 'canvas', canvas, 'ctx', this.ctx);
    
    // Deferred rendering option (JSSpeccy3-style frame buffer)
    this.useDeferredRendering = options.useDeferredRendering || false;
    if (this.useDeferredRendering) {
      this.frameBuffer = new FrameBuffer();
      this.frameBuffer.attach(memory);
      this.frameRenderer = new FrameRenderer(canvas);
      // FrameRenderer sets canvas to 320x240 for borders - don't override
      console.log('[ULA] Deferred rendering enabled (320x240 with borders)');
    } else {
      // Legacy mode: 256x192 without borders
      this.canvas.width = 256;
      this.canvas.height = 192;
      this.ctx.imageSmoothingEnabled = false;
      // Image buffer for 256x192 RGBA
      this.image = this.ctx.createImageData(256, 192);
    }

    // CRITICAL: 50Hz interrupt generation for ZX Spectrum boot sequence
    this.cpu = null; // Will be set by attachCPU()
    this.frameCounter = 0; // FRAMES system variable at 0x5C5C
    this.tstatesPerFrame = 69888; // ZX Spectrum 50Hz frame timing
    this.tstatesInFrame = 0;
    this.interruptEnabled = false; // Set to true when CPU enables interrupts

    // Border colour (0-7)
    this.border = 0;

    // Keyboard matrix: 8 rows, each byte bit = 0 when key pressed (active low)
    this.keyMatrix = new Uint8Array(8).fill(0xff);

    // Flash handling
    this.flashState = false;
    this._lastFlashToggle = performance.now();
    this._flashInterval = 320; // ms, typical Spectrum flash period ~320ms
    
    // Display initialization tracking
    this._initialized = false;
    
    // Debug logging flag
    this._debug = false;

    // QUICK FIX: Initialize display memory in constructor to avoid race conditions
    // When bitmap/attrs are not yet available we initialize; otherwise leave existing RAM intact
    const _bm = this.mem && this.mem.getBitmapView ? this.mem.getBitmapView() : null;
    const _at = this.mem && this.mem.getAttributeView ? this.mem.getAttributeView() : null;
    if (!_bm || !_at) this._initializeDisplayMemory();

    // Spectrum palettes (normal and bright)
    this.paletteNormal = [
      [0, 0, 0],       // black
      [0, 0, 192],     // blue
      [192, 0, 0],     // red
      [192, 0, 192],   // magenta
      [0, 192, 0],     // green
      [0, 192, 192],   // cyan
      [192, 192, 0],   // yellow
      [192, 192, 192], // white
    ];
    this.paletteBright = [
      [0, 0, 0],       // black (bright black same)
      [0, 0, 255],
      [255, 0, 0],
      [255, 0, 255],
      [0, 255, 0],
      [0, 255, 255],
      [255, 255, 0],
      [255, 255, 255],
    ];

    // Initialize border colour on canvas background
    this._updateCanvasBorder();
    // Ensure border color is white at boot (Spectrum default)
    this.border = 7;
    this.borderBright = false;
    this._updateCanvasBorder();
  }

  // CRITICAL: Attach CPU for interrupt generation
  attachCPU(cpu) {
    this.cpu = cpu;
  }

  // CRITICAL: Update interrupt state based on CPU IFF flags
  updateInterruptState() {
    if (this.cpu) {
      this.interruptEnabled = this.cpu.IFF1;
    }
  }

  // Enable/disable debug logging
  setDebug(enabled) {
    this._debug = enabled;
  }

  // QUICK FIX: Initialize display memory early to avoid race conditions with ROM
  _initializeDisplayMemory() {
    if (!this.mem) return;
    if (typeof window !== 'undefined' && window.__TEST__) (window.__TEST__.ulaInitCalls = window.__TEST__.ulaInitCalls || []).push({ t: Date.now(), pc: (window.__LAST_PC__ || null) });
    
    const bitmap = this.mem.getBitmapView ? this.mem.getBitmapView() : null;
    const attrs = this.mem.getAttributeView ? this.mem.getAttributeView() : null;
    
    if (bitmap) {
      bitmap.fill(0x00); // Clear bitmap to black pixels
    }
    if (attrs) {
      attrs.fill(0x38); // Set attributes to white ink on black paper (0x38 = 00111000)
    }
    
    console.log('[ULA] Display memory initialized in constructor');
  }

  // QUICK FIX: Synchronous interrupt generation (replaces async setTimeout)
  generateInterruptSync() {
    if (!this.cpu) return;
    
    // Increment internal frame counter (for ULA tracking, not written to memory)
    this.frameCounter = (this.frameCounter + 1) & 0xFFFFFFFF;
    
    // NOTE: Do NOT write FRAMES to memory here!
    // The ROM's interrupt handler at 0x0038 is responsible for incrementing
    // the FRAMES system variable at 0x5C78-0x5C7A. Direct writes here
    // interfere with the ROM's RAM test during boot.
    
    // Generate interrupt synchronously if interrupts are enabled
    if (this.interruptEnabled && this.cpu.IFF1) {
      this.cpu.intRequested = true;
    }
  }

  // Legacy method for backwards compatibility (still available but deprecated)
  generateInterrupt(tstates) {
    // Delegate to synchronous version - tstates tracking no longer needed
    // as we generate interrupt at frame boundary in main loop
    this.generateInterruptSync();
  }

  // Update canvas CSS background to reflect border colour
  _updateCanvasBorder() {
    const pal = (this.borderBright ? this.paletteBright : this.paletteNormal)[this.border & 0x07];
    this.canvas.style.backgroundColor = `rgb(${pal[0]},${pal[1]},${pal[2]})`;
  }

  // Port write from CPU (port can be 16-bit). Handle OUT (0xFE) for border and speaker bits
  writePort(port, value) {
    const p = port & 0xff;
    if (p === 0xfe) {
      // Bits 0-2 = border colour
      this.border = value & 0x07;
      // Bit 3: tape output (mic) - not implemented
      // Bit 4: speaker (beeper) - not handled here (Sound module handles it)
      // Bit 6: unknown, Bit 7: unknown
      // Bright for border isn't a real separate flag; but we store for completeness
      this.borderBright = !!(value & 0x40);
      this._updateCanvasBorder();
    }
  }

  // Port read from CPU. Implement 0xFE keyboard scanning (rows selected via high byte of port)
  readPort(port) {
    const p = port & 0xff;
    if (p === 0xfe) {
      // The ZX Spectrum samples the upper address lines to select keyboard rows (active low).
      const high = (port >> 8) & 0xff;
      // Start with all bits high (no key pressed). 
      // Bits 0-4 correspond to keys in the selected rows.
      // Bit 5: tape EAR input (1 = no signal)
      // Bits 6-7: always 1
      let result = 0xff;
      // For each row: if the corresponding bit in high is zero (selected), AND the row matrix
      for (let row = 0; row < 8; row++) {
        if (((high >> row) & 0x01) === 0) {
          result &= this.keyMatrix[row];
        }
      }
      // Ensure upper bits are set correctly (tape EAR = 1, bits 6-7 = 1)
      result |= 0b11100000;
      
      if (this._debug && (result & 0x1f) !== 0x1f) {
        console.log(`[ULA] readPort(0x${port.toString(16)}): high=0x${high.toString(16)}, result=0x${result.toString(16)}`);
      }
      // Test hook: capture port reads for diagnostics
      try {
        if (typeof window !== 'undefined' && window.__TEST__) {
          window.__TEST__.portReads = window.__TEST__.portReads || [];
          window.__TEST__.portReads.push({ port: port & 0xffff, high, result: result & 0xff, t: (this.cpu && this.cpu.tstates) || 0 });
          if (window.__TEST__.portReads.length > 256) window.__TEST__.portReads.shift();
        }
      } catch (e) { /* ignore */ }
      
      return result & 0xff;
    }
    // Unhandled ports return 0xff by default
    return 0xff;
  }

  // Helper for input module: set key state in matrix
  // row: 0..7, bitMask: bit (0..7) mask (1<<bit), pressed: boolean
  setKey(row, bitMask, pressed) {
    if (row < 0 || row > 7) return;
    if (pressed) {
      // active low: clear bit
      this.keyMatrix[row] &= ~bitMask;
    } else {
      // release -> set bit
      this.keyMatrix[row] |= bitMask;
    }
  }



  // Toggle flash state based on time
  _updateFlash() {
    const now = performance.now();
    if (now - this._lastFlashToggle >= this._flashInterval) {
      this.flashState = !this.flashState;
      this._lastFlashToggle = now;
    }
  }

  // Main render routine: read bitmap and attributes from memory and write to canvas ImageData
  render() {
    // Update flash timing
    this._updateFlash();

    // Diagnostic: on first render, capture CHARS pointer and glyph bytes for 0x7F/0x80
    if (!this._firstRenderLogged) {
      this._firstRenderLogged = true;
      try {
        const lo = this.mem.read(0x5C36);
        const hi = this.mem.read(0x5C37);
        const chars = (hi << 8) | lo;
        const glyphs = {};
        [0x7f, 0x80].forEach(code => {
          const bytes = [];
          for (let i = 0; i < 8; i++) bytes.push(this.mem.read((chars + code*8 + i) & 0xffff));
          glyphs[code] = bytes;
        });
        if (typeof console !== 'undefined' && console.log) console.log('[ULA] CHARS pointer:', '0x' + chars.toString(16).padStart(4,'0'), 'glyphs:', glyphs);
        try { if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__.charsDiag = { chars, glyphs, t: Date.now(), pc: (window.__LAST_PC__||null) }; } catch (e) { /* ignore */ }
      } catch (e) {
        console.warn('[ULA] chars diagnostic failed', e);
      }
    }
    
    // Use deferred rendering if enabled (JSSpeccy3 style)
    if (this.useDeferredRendering && this.frameBuffer && this.frameRenderer) {
      // Generate frame buffer from current memory state
      this.frameBuffer.setBorder(this.border);
      this.frameBuffer.generateFromMemory();
      this.frameBuffer.endFrame(this.tstatesPerFrame);
      
      // Render frame buffer to canvas
      this.frameRenderer.render(this.frameBuffer, this.frameBuffer.getFlashPhase());
      
      // Start new frame
      this.frameBuffer.startFrame();
      return;
    }
    
    // Legacy immediate rendering
    // DEBUG: log render call
    // console.log('[ULA] render called');

    const bitmap = this.mem.getBitmapView ? this.mem.getBitmapView() : null; // 6912 bytes: arranged in Spectrum scanline order
    const attrs = this.mem.getAttributeView ? this.mem.getAttributeView() : null; // 768 bytes

    if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__._lastRenderContext = { useDeferred: this.useDeferredRendering, t: Date.now(), pc: (window.__LAST_PC__ || null) };

    // --- REMOVED AGGRESSIVE VIDEO MEMORY PROTECTION ---
    // The previous protection was destroying display content and preventing
    // copyright message from appearing. Let ROM boot sequence manage display.
    // Only initialize on first render if memory views are missing.
    if (!this._initialized) {
      if (bitmap) bitmap.fill(0x00);
      if (attrs) attrs.fill(0x38);
      this._initialized = true;
      console.log('[ULA] Initialized display memory once');
    }

    if (!bitmap || !attrs) {
      console.warn('[ULA] render: missing bitmap or attrs', bitmap, attrs);
      return;
    }
    const width = 256;
    const height = 192;
    const img = this.image.data; // Uint8ClampedArray

    // Helpers for addressing
    // bitmap index calculation per ZX Spectrum memory layout
    // addrIndex = ((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | xByte

    for (let y = 0; y < height; y++) {
      for (let xByte = 0; xByte < 32; xByte++) {
        // Compute bitmap index using canonical ZX Spectrum layout in one expression
        const bIndex = (((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | xByte) & 0x1fff;
        const byte = bitmap[bIndex];

        // Attribute cell index: 32 bytes across, 24 rows
        const attrIndex = (Math.floor(y / 8) * 32) + xByte;
        const attr = attrs[attrIndex];

        let ink = attr & 0x07;
        let paper = (attr >> 3) & 0x07;
        const bright = (attr & 0x40) !== 0;
        const flash = (attr & 0x80) !== 0;

        // If flash is set and flashState is active, swap ink/paper
        if (flash && this.flashState) {
          const tmp = ink; ink = paper; paper = tmp;
        }

        const palette = bright ? this.paletteBright : this.paletteNormal;
        const inkColor = palette[ink];
        const paperColor = palette[paper];

        // Use MSB-first mask for clarity: mask = 0x80 >> bit
        // Map bit index 0..7 to left..right within the byte
        for (let bit = 0; bit < 8; bit++) {
          const mask = 0x80 >> bit;
          const pixelSet = (byte & mask) !== 0;
          const x = (xByte << 3) | bit; // bit 0 -> left-most within byte
          const color = pixelSet ? inkColor : paperColor;

          const idx = (y * width + x) * 4;
          img[idx] = color[0];
          img[idx + 1] = color[1];
          img[idx + 2] = color[2];
          img[idx + 3] = 0xff;
        }
      }
    }

    // Blit to canvas
    this.ctx.putImageData(this.image, 0, 0);

    // Test hook: notify tests that a render finished (legacy path)
    try {
      if (typeof window !== 'undefined' && window.__TEST__ && typeof window.__TEST__.frameRendered === 'function') {
        window.__TEST__.frameRendered();
      }
    } catch (e) { /* ignore */ }
  }
}
