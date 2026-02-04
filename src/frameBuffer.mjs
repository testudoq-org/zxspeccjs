/**
 * FrameBuffer - Deferred rendering system for ZX Spectrum emulation
 * 
 * Based on the JSSpeccy3 approach: instead of rendering live memory,
 * we log video state changes throughout the frame and render from the log.
 * 
 * This solves timing issues where the ROM is mid-write when render() is called.
 * 
 * Frame buffer format (similar to JSSpeccy3):
 * - 320x240 output (24 lines top border, 192 main screen, 24 lines bottom border)
 * - Each main screen line: 32px left border + 256px screen + 32px right border
 * - Total: 0x6600 bytes (26112 bytes)
 */

// Output dimensions
const OUTPUT_WIDTH = 320;           // 32 left border + 256 screen + 32 right border
const OUTPUT_HEIGHT = 240;          // 24 top border + 192 screen + 24 bottom border
const BORDER_TOP_LINES = 24;
const BORDER_BOTTOM_LINES = 24;
const MAIN_SCREEN_LINES = 192;      // Main display lines

// Buffer sizes
const FRAME_BUFFER_SIZE = 0x6600;   // 26112 bytes for frame data

export class FrameBuffer {
  constructor() {
    // The frame buffer stores video data in display order
    // Format: border bytes (1 byte = 2 pixels), then screen byte + attr byte pairs
    this.buffer = new Uint8Array(FRAME_BUFFER_SIZE);
    
    // Current state
    this.borderColour = 7;          // Default white border
    this.writePtr = 0;              // Current write position in buffer
    this.lastUpdateTstate = 0;      // Last tstate when buffer was updated
    
    // Memory references (set by attach())
    this.mem = null;
    
    // Frame state
    this.flashPhase = 0;            // Flash counter (0-31)
  }
  
  /**
   * Attach memory for reading video data
   */
  attach(memory) {
    this.mem = memory;
  }

  /**
   * Check whether display is likely ready for rendering.
   * Heuristic: CHARS pointer (0x5C36-0x5C37) is set to a valid value.
   */
  isDisplayReady() {
    try {
      if (!this.mem) return false;
      const lo = this.mem.read(0x5C36);
      const hi = this.mem.read(0x5C37);
      const charsPtr = (hi << 8) | lo;
      // CHARS should point to font-256, typically 0x3C00 (ROM) or 0xFC00 (RAM)
      // If it's 0 or uninitialized (0xFFFF), display is not ready
      return charsPtr !== 0 && charsPtr !== 0xFFFF;
    } catch (e) { return false; }
  }
  
  /**
   * Reset buffer at start of frame
   */
  startFrame() {
    this.writePtr = 0;
    this.lastUpdateTstate = 0;
  }
  
  /**
   * Update buffer up to current tstate
   * Called before any state change that affects video output
   */
  updateToTstate(currentTstate) {
    if (!this.mem) return;
    
    // Calculate which scanline and pixel we're at
    const tstatesElapsed = currentTstate - this.lastUpdateTstate;
    if (tstatesElapsed <= 0) return;
    
    // Fill buffer with current state up to this point
    this._fillBufferToTstate(currentTstate);
    this.lastUpdateTstate = currentTstate;
  }
  
  /**
   * Set border colour (call updateToTstate first!)
   */
  setBorder(colour) {
    this.borderColour = colour & 0x07;
  }
  
  /**
   * Complete the frame buffer (fill remaining data)
   */
  endFrame(finalTstate) {
    this.updateToTstate(finalTstate);
    
    // Ensure buffer is completely filled
    while (this.writePtr < FRAME_BUFFER_SIZE) {
      this.buffer[this.writePtr++] = this.borderColour;
    }
    
    // Advance flash phase
    this.flashPhase = (this.flashPhase + 1) & 0x1f;
  }
  
  /**
   * Fill buffer up to specified tstate
   * Internal method that generates the frame buffer data
   * Note: Full cycle-accuracy would require tracking every memory write with its tstate.
   * This implementation focuses on getting correct final output.
   */
  _fillBufferToTstate() {
    // This is a simplified version - full cycle-accuracy would
    // require tracking every memory write with its tstate.
    // This implementation focuses on getting correct final output
    // rather than mid-frame accuracy (which requires more complexity)
  }
  
  /**
   * Generate complete frame buffer from current memory state
   * This is called at end of frame to capture the final state
   */
  generateFromMemory() {
    if (!this.mem) return;

    // Obtain views from memory but operate on local copies so we do NOT
    // mutate the emulator's live RAM when performing renderer backfills.
    const bitmapView = this.mem.getBitmapView ? this.mem.getBitmapView() : null;
    const attrsView = this.mem.getAttributeView ? this.mem.getAttributeView() : null;

    if (!bitmapView || !attrsView) return;

    // Make copies to avoid writing into the emulator memory (backfill must be local)
    const bitmap = new Uint8Array(bitmapView);
    const attrs = new Uint8Array(attrsView);

    // DEBUG: Optionally log a small sample of the bitmap for diagnostics
    this._debugBitmapSample(bitmap);

    let ptr = 0;
    ptr = this._fillTopBorder(ptr);

    // Main screen area (192 lines) - operates on local copies
    // NOTE: Removed bogus "smart backfill" that was reading from 0x5C00 (system variables)
    // thinking it was a text buffer. The ZX Spectrum has NO text buffer - the ROM writes
    // character glyphs directly to bitmap memory at 0x4000-0x57FF.

    ptr = this._fillMainScreen(ptr, bitmap, attrs);

    // Bottom border (24 lines, 160 bytes each)
    ptr = this._fillBottomBorder(ptr);

    // CRITICAL: Update writePtr so endFrame() doesn't overwrite the buffer
    this.writePtr = ptr;

    try {
      if (typeof globalThis !== 'undefined' && globalThis.__TEST__ && typeof globalThis.__TEST__.frameGenerated === 'function') {
        globalThis.__TEST__.frameGenerated();
      }
    } catch (e) { /* nom */ }
  }

  _debugBitmapSample(bitmap) {
    this._debugCount = (this._debugCount || 0) + 1;
    if (this._debugCount <= 3 || (this._debugCount % 500 === 0)) {
      let nonZero = 0;
      for (let i = 0; i < bitmap.length; i++) if (bitmap[i] !== 0) nonZero++;
      if (typeof globalThis !== 'undefined' && globalThis.console) globalThis.console.log(`[FrameBuffer] Frame ${this._debugCount}: Bitmap non-zero: ${nonZero}/${bitmap.length}`);
      if (typeof globalThis !== 'undefined' && globalThis.__TEST__) globalThis.__TEST__.lastFrameBitmapNonZero = nonZero;
      if (nonZero > 0 && this._debugCount <= 5) {
        const sample = Array.from(bitmap.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        if (typeof globalThis !== 'undefined' && globalThis.console) globalThis.console.log('[FrameBuffer] First 64 bitmap bytes:', sample);
      }
    }
  }

  _fillTopBorder(ptr) {
    for (let y = 0; y < BORDER_TOP_LINES; y++) {
      for (let x = 0; x < 160; x++) this.buffer[ptr++] = this.borderColour;
    }
    return ptr;
  }

  _fillBottomBorder(ptr) {
    for (let y = 0; y < BORDER_BOTTOM_LINES; y++) {
      for (let x = 0; x < 160; x++) this.buffer[ptr++] = this.borderColour;
    }
    return ptr;
  }

  _fillMainScreen(ptr, bitmap, attrs) {
    for (let y = 0; y < MAIN_SCREEN_LINES; y++) {
      for (let x = 0; x < 16; x++) this.buffer[ptr++] = this.borderColour;
      const y0 = y & 0x07;
      const y1 = (y & 0x38) >> 3;
      const y2 = (y & 0xC0) >> 6;
      // NOTE: Removed bogus "backfill" logic that was reading from 0x5C00 (system variables)
      // thinking it was a text buffer. The ZX Spectrum has NO text buffer - the ROM writes
      // character glyphs directly to bitmap memory at 0x4000-0x57FF.
      // Just render what's actually in bitmap memory.
      for (let xByte = 0; xByte < 32; xByte++) {
        const bitmapAddr = (y0 << 8) | (y1 << 5) | (y2 << 11) | xByte;
        const attrAddr = (Math.floor(y / 8) * 32) + xByte;
        this.buffer[ptr++] = bitmap[bitmapAddr];
        this.buffer[ptr++] = attrs[attrAddr];
      }
      for (let x = 0; x < 16; x++) this.buffer[ptr++] = this.borderColour;
    }
    return ptr;
  }

  // NOTE: Removed _tryBackfillCell method - it was based on the incorrect assumption
  // that the ZX Spectrum has a "text buffer" at 0x5C00. That address range is actually
  // system variables (KSTATE, etc). The Spectrum has NO text buffer - character glyphs
  // are written directly to bitmap memory at 0x4000-0x57FF.

  // NOTE: Removed ensureBackfilledDisplayCell method for the same reason.

  /**
   * Get the frame buffer for rendering
   */
  getBuffer() {
    return this.buffer;
  }
  
  /**
   * Get current flash phase (for renderer)
   */
  getFlashPhase() {
    return this.flashPhase;
  }
}

/**
 * FrameRenderer - Renders frame buffer to canvas
 * Decoupled from buffer generation for cleaner architecture
 */
export class FrameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Set canvas size for full output including borders
    this.canvas.width = OUTPUT_WIDTH;
    this.canvas.height = OUTPUT_HEIGHT;
    this.ctx.imageSmoothingEnabled = false;
    
    // Create image data for rendering
    this.imageData = this.ctx.createImageData(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    
    // Spectrum palette (RGBA as 32-bit values, little-endian)
    // Format depends on endianness, detect and adjust
    this.palette = this._createPalette();
  }
  
  _createPalette() {
    // Check endianness
    const testUint8 = new Uint8Array(new Uint16Array([0x8000]).buffer);
    const isLittleEndian = (testUint8[0] === 0);
    
    // Base colours (RGB)
    const baseColours = [
      [0, 0, 0],       // 0: black
      [0, 0, 192],     // 1: blue
      [192, 0, 0],     // 2: red
      [192, 0, 192],   // 3: magenta
      [0, 192, 0],     // 4: green
      [0, 192, 192],   // 5: cyan
      [192, 192, 0],   // 6: yellow
      [192, 192, 192], // 7: white
      // Bright variants
      [0, 0, 0],       // 8: black (bright)
      [0, 0, 255],     // 9: bright blue
      [255, 0, 0],     // 10: bright red
      [255, 0, 255],   // 11: bright magenta
      [0, 255, 0],     // 12: bright green
      [0, 255, 255],   // 13: bright cyan
      [255, 255, 0],   // 14: bright yellow
      [255, 255, 255], // 15: bright white
    ];
    
    const palette = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const [r, g, b] = baseColours[i];
      if (isLittleEndian) {
        palette[i] = 0xFF000000 | (b << 16) | (g << 8) | r; // ABGR
      } else {
        palette[i] = (r << 24) | (g << 16) | (b << 8) | 0xFF; // RGBA
      }
    }
    return palette;
  }
  
  /**
   * Render frame buffer to canvas
   */
  render(frameBuffer, flashPhase) {
    const buffer = frameBuffer.getBuffer();
    let pixelPtr = 0;
    let bufferPtr = 0;

    const palette = this.palette;
    const pixels = this.pixels;

    ({ bufferPtr, pixelPtr } = this._renderTopBorder(buffer, bufferPtr, pixelPtr, palette, pixels));
    ({ bufferPtr, pixelPtr } = this._renderMainScreen(frameBuffer, buffer, bufferPtr, pixelPtr, palette, pixels, flashPhase));
    ({ bufferPtr, pixelPtr } = this._renderBottomBorder(buffer, bufferPtr, pixelPtr, palette, pixels));

    // Draw to canvas
    this.ctx.putImageData(this.imageData, 0, 0);

    // Test hook: notify tests that a render finished
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__TEST__ && typeof globalThis.__TEST__.frameRendered === 'function') {
        globalThis.__TEST__.frameRendered();
      }
    } catch (e) { /* nom */ }
  }

  _renderTopBorder(buffer, bufferPtr, pixelPtr, palette, pixels) {
    for (let y = 0; y < BORDER_TOP_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        const borderColour = palette[buffer[bufferPtr++]];
        pixels[pixelPtr++] = borderColour;
        pixels[pixelPtr++] = borderColour;
      }
    }
    return { bufferPtr, pixelPtr };
  }

  _renderBottomBorder(buffer, bufferPtr, pixelPtr, palette, pixels) {
    for (let y = 0; y < BORDER_BOTTOM_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        const borderColour = palette[buffer[bufferPtr++]];
        pixels[pixelPtr++] = borderColour;
        pixels[pixelPtr++] = borderColour;
      }
    }
    return { bufferPtr, pixelPtr };
  }

  _notifyFrameGenerated() {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__TEST__ && typeof globalThis.__TEST__.frameGenerated === 'function') {
        globalThis.__TEST__.frameGenerated();
      }
    } catch (e) { /* nom */ }
  }

  _callFrameGeneratedFallback() {
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__TEST__ && typeof globalThis.__TEST__.frameGenerated === 'function') {
        globalThis.__TEST__.frameGenerated();
      }
    } catch (e) { /* nom */ }
  }

  _renderMainScreen(frameBuffer, buffer, bufferPtr, pixelPtr, palette, pixels, flashPhase) {
    for (let y = 0; y < MAIN_SCREEN_LINES; y++) {
      // Left border
      for (let x = 0; x < 16; x++) {
        const borderColour = palette[buffer[bufferPtr++]];
        pixels[pixelPtr++] = borderColour;
        pixels[pixelPtr++] = borderColour;
      }

      // Screen data (32 character cells)
      // NOTE: Removed bogus "render-time backfill" call - it was based on the incorrect
      // assumption that the ZX Spectrum has a "text buffer" at 0x5C00.
      for (let x = 0; x < 32; x++) {
        let bitmap = buffer[bufferPtr++];
        const attr = buffer[bufferPtr++];
        pixelPtr = this._renderCell(pixels, pixelPtr, bitmap, attr, palette, flashPhase);
      }

      // Right border
      for (let x = 0; x < 16; x++) {
        const borderColour = palette[buffer[bufferPtr++]];
        pixels[pixelPtr++] = borderColour;
        pixels[pixelPtr++] = borderColour;
      }
    }
    return { bufferPtr, pixelPtr };
  }

  _renderCell(pixels, pixelPtr, bitmap, attr, palette, flashPhase) {
    let ink = attr & 0x07;
    let paper = (attr >> 3) & 0x07;
    const bright = (attr & 0x40) ? 8 : 0;

    if (attr & 0x80) {
      if (flashPhase & 0x10) {
        const tmp = ink; ink = paper; paper = tmp;
      }
    }

    const inkColour = palette[ink + bright];
    const paperColour = palette[paper + bright];

    for (let bit = 0; bit < 8; bit++) {
      pixels[pixelPtr++] = (bitmap & 0x80) ? inkColour : paperColour;
      bitmap <<= 1;
    }
    return pixelPtr;
  }
}

export { FRAME_BUFFER_SIZE, OUTPUT_WIDTH, OUTPUT_HEIGHT };
