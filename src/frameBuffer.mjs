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
    
    const bitmap = this.mem.getBitmapView ? this.mem.getBitmapView() : null;
    const attrs = this.mem.getAttributeView ? this.mem.getAttributeView() : null;
    
    if (!bitmap || !attrs) return;
    
    // DEBUG: Log bitmap sample periodically to diagnose display issues
    this._debugCount = (this._debugCount || 0) + 1;
    if (this._debugCount <= 3 || (this._debugCount % 500 === 0)) {
      let nonZero = 0;
      for (let i = 0; i < bitmap.length; i++) if (bitmap[i] !== 0) nonZero++;
      if (typeof console !== 'undefined') console.log(`[FrameBuffer] Frame ${this._debugCount}: Bitmap non-zero: ${nonZero}/${bitmap.length}`);
      if (nonZero > 0 && this._debugCount <= 5) {
        // Find which addresses have non-zero bytes
        const sample = Array.from(bitmap.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        if (typeof console !== 'undefined') console.log('[FrameBuffer] First 64 bitmap bytes:', sample);
      }
    }
    
    let ptr = 0;
    
    // Top border (24 lines, 160 bytes each = 320 pixels at 2px per byte)
    for (let y = 0; y < BORDER_TOP_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        this.buffer[ptr++] = this.borderColour;
      }
    }
    
    // Main screen area (192 lines)
    for (let y = 0; y < MAIN_SCREEN_LINES; y++) {
      // Left border (16 bytes = 32 pixels)
      for (let x = 0; x < 16; x++) {
        this.buffer[ptr++] = this.borderColour;
      }
      
      // Screen data (32 character cells = 64 bytes: bitmap + attr pairs)
      // Calculate ZX Spectrum memory address for this line
      const y0 = y & 0x07;
      const y1 = (y & 0x38) >> 3;
      const y2 = (y & 0xC0) >> 6;
      
      for (let xByte = 0; xByte < 32; xByte++) {
        // Bitmap address calculation
        const bitmapAddr = (y0 << 8) | (y1 << 5) | (y2 << 11) | xByte;
        const attrAddr = (Math.floor(y / 8) * 32) + xByte;
        
        this.buffer[ptr++] = bitmap[bitmapAddr];
        this.buffer[ptr++] = attrs[attrAddr];
      }
      
      // Right border (16 bytes = 32 pixels)
      for (let x = 0; x < 16; x++) {
        this.buffer[ptr++] = this.borderColour;
      }
    }
    
    // Bottom border (24 lines, 160 bytes each)
    for (let y = 0; y < BORDER_BOTTOM_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        this.buffer[ptr++] = this.borderColour;
      }
    }
    
    // CRITICAL: Update writePtr so endFrame() doesn't overwrite the buffer
    this.writePtr = ptr;
  }
  
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
    
    // Top border (24 lines)
    for (let y = 0; y < BORDER_TOP_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        const borderColour = this.palette[buffer[bufferPtr++]];
        this.pixels[pixelPtr++] = borderColour;
        this.pixels[pixelPtr++] = borderColour;
      }
    }
    
    // Main screen (192 lines)
    for (let y = 0; y < MAIN_SCREEN_LINES; y++) {
      // Left border
      for (let x = 0; x < 16; x++) {
        const borderColour = this.palette[buffer[bufferPtr++]];
        this.pixels[pixelPtr++] = borderColour;
        this.pixels[pixelPtr++] = borderColour;
      }
      
      // Screen data (32 character cells)
      for (let x = 0; x < 32; x++) {
        let bitmap = buffer[bufferPtr++];
        const attr = buffer[bufferPtr++];
        
        // Decode attribute byte
        let ink = attr & 0x07;
        let paper = (attr >> 3) & 0x07;
        const bright = (attr & 0x40) ? 8 : 0; // Add 8 for bright palette
        const flash = attr & 0x80;
        
        // Handle flash
        if (flash && (flashPhase & 0x10)) {
          // Swap ink and paper
          const tmp = ink;
          ink = paper;
          paper = tmp;
        }
        
        const inkColour = this.palette[ink + bright];
        const paperColour = this.palette[paper + bright];
        
        // Render 8 pixels
        for (let bit = 0; bit < 8; bit++) {
          this.pixels[pixelPtr++] = (bitmap & 0x80) ? inkColour : paperColour;
          bitmap <<= 1;
        }
      }
      
      // Right border
      for (let x = 0; x < 16; x++) {
        const borderColour = this.palette[buffer[bufferPtr++]];
        this.pixels[pixelPtr++] = borderColour;
        this.pixels[pixelPtr++] = borderColour;
      }
    }
    
    // Bottom border (24 lines)
    for (let y = 0; y < BORDER_BOTTOM_LINES; y++) {
      for (let x = 0; x < 160; x++) {
        const borderColour = this.palette[buffer[bufferPtr++]];
        this.pixels[pixelPtr++] = borderColour;
        this.pixels[pixelPtr++] = borderColour;
      }
    }
    
    // Draw to canvas
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}

export { FRAME_BUFFER_SIZE, OUTPUT_WIDTH, OUTPUT_HEIGHT };
