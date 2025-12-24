// ULA graphics emulation for ZX Spectrum 48K (ES6 module)
export class ULA {
  constructor(memory, canvas) {
    this.mem = memory; // instance of Memory
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Ensure canvas pixel size matches Spectrum bitmap
    this.canvas.width = 256;
    this.canvas.height = 192;
    this.ctx.imageSmoothingEnabled = false;

    // Image buffer for 256x192 RGBA
    this.image = this.ctx.createImageData(256, 192);

    // Border colour (0-7)
    this.border = 0;

    // Keyboard matrix: 8 rows, each byte bit = 0 when key pressed (active low)
    this.keyMatrix = new Uint8Array(8).fill(0xff);

    // Flash handling
    this.flashState = false;
    this._lastFlashToggle = performance.now();
    this._flashInterval = 320; // ms, typical Spectrum flash period ~320ms

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
      // Start with all bits high (no key pressed). Bits 0-4 correspond to keys in the selected rows.
      let result = 0xff;
      // For each row: if the corresponding bit in high is zero (selected), AND the row matrix
      for (let row = 0; row < 8; row++) {
        if (((high >> row) & 0x01) === 0) {
          result &= this.keyMatrix[row];
        }
      }
      // The lower 5 bits are keyboard data; keep upper bits as 1 for simplicity
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

    const bitmap = this.mem.getBitmapView(); // 6912 bytes: arranged in Spectrum scanline order
    const attrs = this.mem.getAttributeView(); // 768 bytes
    const width = 256;
    const height = 192;
    const img = this.image.data; // Uint8ClampedArray

    // Helpers for addressing
    // bitmap index calculation per ZX Spectrum memory layout
    // addrIndex = ((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | xByte

    for (let y = 0; y < height; y++) {
      const y0 = y & 0x07;
      const y1 = (y & 0x38) >> 3;
      const y2 = (y & 0xC0) >> 6;
      for (let xByte = 0; xByte < 32; xByte++) {
        const bIndex = (y0 << 8) | (y1 << 5) | (y2 << 11) | xByte;
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

        // For each bit in the byte (MSB left)
        for (let bit = 0; bit < 8; bit++) {
          const x = (xByte << 3) | (7 - bit); // MSB at left
          const pixelSet = (byte >> bit) & 0x01;
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
  }
}
