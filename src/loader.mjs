export class Loader {
  /**
   * High-level file loader. Returns either an ArrayBuffer for plain ROMs
   * or an object { rom: ArrayBuffer|null, snapshot: {...} } for snapshots/tapes.
   */
  static async loadFromFile(file) {
    const name = (file.name || '').toLowerCase();
    const ext = name.split('.').pop();

    const buffer = await file.arrayBuffer();

    if (ext === 'rom' || ext === 'bin') {
      return buffer;
    }

    if (ext === 'z80') {
      return this.parseZ80(buffer);
    }

    if (ext === 'tap') {
      return this.parseTAP(buffer);
    }

    // Fallback: return raw buffer
    return buffer;
  }

  /** Minimal/robust .z80 parser that extracts a 48K RAM image when present
   * and attempts to read basic registers from common header offsets.
   * This implementation intentionally keeps parsing simple and defensive.
   */
  static parseZ80(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const len = buf.length;

    // Try to find a contiguous 48K RAM image (49152 bytes). Many .z80 files
    // append the full RAM image after a header. As a heuristic take the last
    // 49152 bytes if the file is large enough.
    const RAM_SIZE = 48 * 1024;
    let ramImage = null;
    if (len >= RAM_SIZE) {
      ramImage = buf.subarray(len - RAM_SIZE, len);
    }

    // Try to read some registers from the header if present (v1/v2 hints).
    const regs = {};
    try {
      const dv = new DataView(arrayBuffer);
      // Common v1 header places PC at offset 0x0C (little-endian) when compressed=0
      if (len >= 30) {
        regs.A = dv.getUint8(0x05) || 0;
        regs.F = dv.getUint8(0x06) || 0;
        regs.B = dv.getUint8(0x07) || 0;
        regs.C = dv.getUint8(0x08) || 0;
        regs.H = dv.getUint8(0x09) || 0;
        regs.L = dv.getUint8(0x0A) || 0;
        // PC little-endian at 0x0C
        regs.PC = dv.getUint16(0x0C, true) || 0;
        regs.SP = dv.getUint16(0x10, true) || 0;
        regs.I = dv.getUint8(0x0E) || 0;
        regs.R = dv.getUint8(0x11) || 0;
      }
    } catch (e) {
      // ignore parsing errors, fall back to defaults
    }

    return {
      rom: null,
      snapshot: {
        ram: ramImage ? new Uint8Array(ramImage) : null,
        registers: regs
      }
    };
  }

  /** Basic TAP parser. Returns an object with an array of blocks (Uint8Array).
   * This does not emulate tape timing—it's a convenience to inspect and
   * extract files from TAP images for loading into the emulator.
   */
  static parseTAP(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    const blocks = [];
    let off = 0;
    while (off + 2 <= buf.length) {
      const blockLen = dv.getUint16(off, true);
      off += 2;
      if (blockLen === 0 || off + blockLen > buf.length) break;
      const block = buf.subarray(off, off + blockLen);
      blocks.push(new Uint8Array(block));
      off += blockLen;
    }

    return { type: 'tap', blocks };
  }

  /** Attach a file input element and callback. The callback receives the
   * parsed result (ArrayBuffer or object).
   */
  static attachInput(inputEl, onLoad) {
    inputEl.addEventListener('change', async (e) => {
      const file = inputEl.files && inputEl.files[0];
      if (!file) return;
      // Use FileReader to demonstrate progress and compatibility
      const reader = new FileReader();
      reader.addEventListener('load', async () => {
        // reader.result is an ArrayBuffer
        try {
          const result = await Loader.loadFromFile(new File([reader.result], file.name, { type: file.type }));
          onLoad(result, file);
        } catch (err) {
          console.error('Loader.attachInput load error', err);
        }
      });
      reader.addEventListener('error', (err) => console.error('FileReader error', err));
      reader.readAsArrayBuffer(file);
    });
  }

  /** Enable drag-and-drop on a DOM element. onLoad receives parsed result and file. */
  static attachDragDrop(el, onLoad) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      try {
        const result = await this.loadFromFile(file);
        onLoad(result, file);
      } catch (err) {
        console.error('Drag drop load error', err);
      }
    });
  }
}
