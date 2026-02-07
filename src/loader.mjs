/* eslint-env browser */
/* global fetch, console, setTimeout, clearTimeout, window, File, FileReader, DOMException */

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
    inputEl.addEventListener('change', async () => {
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

  // ============================================================================
  // Remote loading (tape loading feature)
  // ============================================================================

  /**
   * Fetch a file from a URL with streaming progress and retry support.
   * @param {string} url - URL to fetch
   * @param {Object} opts - { onProgress(percent, loaded, total), signal, retries }
   * @returns {Promise<ArrayBuffer>}
   */
  static async loadFromUrl(url, opts = {}) {
    const { onProgress, signal, retries = 2 } = opts;
    const BACKOFF_BASE = 500;

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this._fetchWithProgress(url, signal, onProgress);
        return result;
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') throw err;
        if (err.retryAfter) {
          await this._delay(err.retryAfter * 1000, signal);
          continue;
        }
        if (attempt < retries) {
          const backoff = BACKOFF_BASE * Math.pow(2, attempt);
          await this._delay(backoff, signal);
        }
      }
    }

    throw lastError || new Error('Failed to fetch');
  }

  /**
   * Fetch with streaming progress support.
   * @param {string} url
   * @param {AbortSignal} signal
   * @param {Function} onProgress
   * @returns {Promise<ArrayBuffer>}
   */
  static async _fetchWithProgress(url, signal, onProgress) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', signal });

    if (!response.ok) {
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
        const err = new Error('Rate limited');
        err.retryAfter = retryAfter;
        throw err;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body && response.body.getReader();
    if (!reader) {
      return await response.arrayBuffer();
    }

    return await this._readStream(reader, response.headers, onProgress);
  }

  /**
   * Read a stream and combine chunks with progress reporting.
   * @param {ReadableStreamDefaultReader} reader
   * @param {Headers} headers
   * @param {Function} onProgress
   * @returns {Promise<ArrayBuffer>}
   */
  static async _readStream(reader, headers, onProgress) {
    const contentLength = parseInt(headers.get('Content-Length') || '0', 10);
    const chunks = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (onProgress && contentLength > 0) {
        const percent = Math.round((loaded / contentLength) * 100);
        onProgress(percent, loaded, contentLength);
      }
    }

    return this._combineChunks(chunks, loaded);
  }

  /**
   * Combine Uint8Array chunks into a single ArrayBuffer.
   * @param {Uint8Array[]} chunks
   * @param {number} totalLength
   * @returns {ArrayBuffer}
   */
  static _combineChunks(chunks, totalLength) {
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined.buffer;
  }

  /**
   * Helper: delay with abort support.
   * @param {number} ms
   * @param {AbortSignal} signal
   */
  static _delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
    });
  }

  /**
   * Minimal TZX parser stub. Returns the raw buffer as a TZX object.
   * Full TZX parsing can be added later.
   * @param {ArrayBuffer} arrayBuffer
   * @returns {{ type: 'tzx', blocks: null, raw: ArrayBuffer }}
   */
  static parseTZX(arrayBuffer) {
    // TZX header signature: "ZXTape!\x1A" (8 bytes)
    const buf = new Uint8Array(arrayBuffer);
    const header = String.fromCharCode(...buf.slice(0, 7));

    if (header !== 'ZXTape!') {
      console.warn('[Loader] TZX header not found, treating as raw');
    }

    // For now, return raw buffer. Full parsing can be added later.
    return { type: 'tzx', blocks: null, raw: arrayBuffer };
  }

  /**
   * Minimal .sna parser supporting classic 48K snapshots.
   * Many .sna files include a 27-byte CPU register header followed by 48K RAM.
   * This parser defensively extracts the last 48K as RAM and reads SP when
   * available. It keeps parsing simple and forgiving.
   */
  static parseSNA(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const len = buf.length;
    const RAM_SIZE = 48 * 1024;

    let ramImage = null;
    if (len >= RAM_SIZE) {
      ramImage = buf.subarray(len - RAM_SIZE, len);
    }

    const regs = {};
    try {
      const dv = new DataView(arrayBuffer);
      // SP in many .sna variants is stored at offsets 0x1A-0x1B (little-endian)
      if (len >= 0x1C) {
        regs.SP = dv.getUint16(0x1A, true);
      }
      // Some variants include I and R at offsets 0x00 and 0x11 (best-effort)
      if (len >= 1) regs.I = dv.getUint8(0x00);
      if (len >= 0x12) regs.R = dv.getUint8(0x11);
    } catch (e) {
      // ignore parsing errors
    }

    return {
      rom: null,
      snapshot: {
        ram: ramImage ? new Uint8Array(ramImage) : null,
        registers: regs
      }
    };
  }

  /**
   * Extract tape files from a ZIP archive.
   * Uses JSZip if available, otherwise throws.
   * @param {ArrayBuffer} arrayBuffer - ZIP file contents
   * @returns {Promise<Array<{ name: string, format: string, arrayBuffer: ArrayBuffer }>>}
   */
  static async extractTapeFromZip(arrayBuffer) {
    // Check if JSZip is available globally or as module
    let JSZip = null;
    if (typeof window !== 'undefined' && window.JSZip) {
      JSZip = window.JSZip;
    } else {
      try {
        // Dynamic import for module environments
        const module = await import('jszip');
        JSZip = module.default || module;
      } catch {
        throw new Error('JSZip not available. Include JSZip to extract ZIP files.');
      }
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = [];
    const TAPE_EXTENSIONS = ['tap', 'tzx'];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      const ext = filename.split('.').pop().toLowerCase();
      if (TAPE_EXTENSIONS.includes(ext)) {
        const data = await file.async('arraybuffer');
        entries.push({
          name: filename,
          format: ext.toUpperCase(),
          arrayBuffer: data,
        });
      }
    }

    // Sort to prefer .tap first
    entries.sort((a, b) => {
      if (a.format === 'TAP' && b.format !== 'TAP') return -1;
      if (a.format !== 'TAP' && b.format === 'TAP') return 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  /**
   * Parse a remote tape file by extension.
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} fileName
   * @returns {Object} Parsed result ({ type: 'tap', blocks } or { type: 'tzx', ... })
   */
  static parseByExtension(arrayBuffer, fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();

    if (ext === 'tap') {
      return this.parseTAP(arrayBuffer);
    }

    if (ext === 'tzx') {
      return this.parseTZX(arrayBuffer);
    }

    if (ext === 'z80') {
      return this.parseZ80(arrayBuffer);
    }

    if (ext === 'sna') {
      return this.parseSNA(arrayBuffer);
    }

    // Unknown format: return raw
    return { type: 'unknown', raw: arrayBuffer };
  }
}
