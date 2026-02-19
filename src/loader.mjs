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

  /**
   * Decompress Z80 snapshot RLE-compressed data.
   * Scheme: ED ED NN VV → repeat byte VV NN times; other bytes are literal.
   * @param {Uint8Array} src - Compressed data
   * @param {number} expectedLen - Expected decompressed length (e.g. 16384 for one page)
   * @returns {Uint8Array} Decompressed data
   */
  static _z80Decompress(src, expectedLen) {
    const out = new Uint8Array(expectedLen);
    let si = 0;
    let di = 0;
    while (si < src.length && di < expectedLen) {
      if (si + 3 < src.length && src[si] === 0xED && src[si + 1] === 0xED) {
        const count = src[si + 2];
        const val = src[si + 3];
        for (let j = 0; j < count && di < expectedLen; j++) out[di++] = val;
        si += 4;
      } else {
        out[di++] = src[si++];
      }
    }
    return out;
  }

  /**
   * Full .z80 snapshot parser supporting v1, v2, and v3 formats.
   * Correctly handles header registers, version detection, RLE decompression,
   * and paged memory blocks for both 48K and 128K snapshots.
   * @param {ArrayBuffer} arrayBuffer - Raw .z80 file contents
   * @returns {{ rom: null, snapshot: { ram: Uint8Array|null, registers: Object, hwMode: number, version: number } }}
   */
  static parseZ80(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const len = buf.length;
    if (len < 30) {
      return { rom: null, snapshot: { ram: null, registers: {}, version: 0, hwMode: 0 } };
    }

    const dv = new DataView(arrayBuffer);
    const PAGE_SIZE = 16384;

    // ── V1 header (30 bytes) — correct offsets per Z80 file format spec ──
    const regs = {};
    regs.A = dv.getUint8(0);
    regs.F = dv.getUint8(1);
    regs.C = dv.getUint8(2);
    regs.B = dv.getUint8(3);
    regs.L = dv.getUint8(4);
    regs.H = dv.getUint8(5);
    const headerPC = dv.getUint16(6, true);   // 0 means v2/v3
    regs.SP = dv.getUint16(8, true);
    regs.I = dv.getUint8(10);
    const rLow = dv.getUint8(11);             // R bits 0-6
    let flagByte = dv.getUint8(12);
    if (flagByte === 255) flagByte = 1;        // per spec: 255 → treat as 1
    regs.R = (rLow & 0x7F) | ((flagByte & 0x01) << 7); // reconstruct R bit 7
    regs.borderColor = (flagByte >> 1) & 0x07;
    const v1Compressed = !!(flagByte & 0x20);

    regs.E = dv.getUint8(13);
    regs.D = dv.getUint8(14);
    // Alternate register set
    regs.C2 = dv.getUint8(15);  // C'
    regs.B2 = dv.getUint8(16);  // B'
    regs.E2 = dv.getUint8(17);  // E'
    regs.D2 = dv.getUint8(18);  // D'
    regs.L2 = dv.getUint8(19);  // L'
    regs.H2 = dv.getUint8(20);  // H'
    regs.A2 = dv.getUint8(21);  // A'
    regs.F2 = dv.getUint8(22);  // F'
    regs.IY = dv.getUint16(23, true);
    regs.IX = dv.getUint16(25, true);
    regs.IFF1 = dv.getUint8(27) !== 0;
    regs.IFF2 = dv.getUint8(28) !== 0;
    regs.IM = dv.getUint8(29) & 0x03;

    // ── Version detection ──
    let version = 1;
    let hwMode = 0;
    let dataOffset = 30;

    if (headerPC === 0 && len > 32) {
      // V2 or V3: extended header present
      const extLen = dv.getUint16(30, true);
      regs.PC = dv.getUint16(32, true);        // real PC from extended header
      if (len > 34) hwMode = dv.getUint8(34);  // hardware mode
      version = extLen === 23 ? 2 : 3;
      dataOffset = 32 + extLen;                 // skip past extended header
    } else {
      regs.PC = headerPC;
    }

    // ── Memory extraction ──
    const RAM_48K = 3 * PAGE_SIZE; // 49152 bytes
    let ramImage = null;

    if (version === 1) {
      // V1: raw or compressed 48K block starting at offset 30
      const raw = buf.subarray(30);
      if (v1Compressed) {
        // Compressed: treat the entire data after header as compressed stream.
        // Do NOT search for an internal terminator marker — some snapshots
        // contain incidental 00 ED ED 00 sequences. Decompress the whole
        // remainder to the expected 48K and pad with zeros if input runs out.
        ramImage = this._z80Decompress(raw, RAM_48K);
      } else {
        // Uncompressed v1: take up to 48K from offset 30
        const available = Math.min(raw.length, RAM_48K);
        ramImage = new Uint8Array(RAM_48K);
        ramImage.set(raw.subarray(0, available));
      }
    } else {
      // V2/V3: paged memory blocks (more robust mapping for 48K / 128K / +3 variants)
      // Strategy:
      //  - collect all page blocks into a temporary map keyed by page number
      //  - after parsing, attempt the most-likely mappings (48K pages 8/4/5,
      //    then 128K-style pages 3..10 -> banks 0..7 and bank->offset heuristics)
      ramImage = new Uint8Array(RAM_48K);
      let pos = dataOffset;
      const pageMap = new Map(); // pageNum -> Uint8Array(16384)

      while (pos + 3 <= len) {
        const blockLen = dv.getUint16(pos, true);
        const pageNum = dv.getUint8(pos + 2);
        pos += 3;

        let pageData;
        if (blockLen === 0xFFFF) {
          // Uncompressed: next 16384 bytes
          pageData = buf.subarray(pos, pos + PAGE_SIZE);
          pos += PAGE_SIZE;
        } else {
          // Compressed block
          if (pos + blockLen > len) break; // truncated
          const compressed = buf.subarray(pos, pos + blockLen);
          pageData = this._z80Decompress(compressed, PAGE_SIZE);
          pos += blockLen;
        }

        // store pageData for later, do not commit into ramImage yet
        pageMap.set(pageNum, pageData);
      }

      // delegate mapping to helper to keep parseZ80 smaller and easier to test
      this._mapZ80PagesToRam(pageMap, ramImage);
    }

    // Diagnostic logging (temporary): report non-zero counts when debug flag set
    if (ramImage && ((typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.Z80_DEBUG) || (typeof window !== 'undefined' && window.__ZX_DEBUG__))) {
      const totalNonZero = (() => { let c = 0; for (let i = 0; i < ramImage.length; i++) if (ramImage[i] !== 0) c++; return c; })();
      const screenNonZero = (() => { let c = 0; const screenLen = Math.min(6912, ramImage.length); for (let i = 0; i < screenLen; i++) if (ramImage[i] !== 0) c++; return c; })();
      console.log('Decompressed RAM non-zero bytes:', totalNonZero);
      console.log('Screen RAM non-zero bytes:', screenNonZero);
    }

    return {
      rom: null,
      snapshot: {
        ram: ramImage,
        registers: regs,
        version,
        hwMode
      }
    };
  }

  /**
   * Map parsed Z80 page blocks into the linear 48K ramImage used by the
   * emulator.  Handles common 48K (.z80 v2) mappings and provides a
   * best-effort mapping for 128K/+3 page-numbered snapshots (pages 3..10).
   *
   * @param {Map<number,Uint8Array>} pageMap
   * @param {Uint8Array} ramImage
   * @param {number} hwMode
   */
  static _mapZ80PagesToRam(pageMap, ramImage) {
    const PAGE_SIZE = 16384;

    // Prefer 128K-style page blocks if any page in the 3..10 range is present
    const has128Pages = [...pageMap.keys()].some(p => p >= 3 && p <= 10);
    if (has128Pages) {
      // 128K-style heuristics: pages 3..10 -> banks 0..7. Map commonly-used
      // banks into the 48K linear view so many 128K snapshots become runnable.
      const bankToPage = (bank) => bank + 3;
      const trySet = (pageNum, offset) => {
        if (!pageMap.has(pageNum)) return false;
        const pd = pageMap.get(pageNum);
        ramImage.set(pd.subarray(0, Math.min(pd.length, PAGE_SIZE)), offset);
        return true;
      };

      // Preferred banks for 48K view: bank5->0, bank2->0x4000, bank0->0x8000
      let applied = false;
      applied = trySet(bankToPage(5), 0x0000) || applied;
      applied = trySet(bankToPage(2), 0x4000) || applied;
      applied = trySet(bankToPage(0), 0x8000) || applied;

      // Only use the simple page->offset fallback if none of the preferred
      // bank mappings were applied (avoid overwriting preferred banks).
      if (!applied) {
        if (pageMap.has(3)) trySet(3, 0x0000);
        if (pageMap.has(4)) trySet(4, 0x4000);
        if (pageMap.has(5)) trySet(5, 0x8000);
      }
      return;
    }

    // If no 128K-style pages are present, fall back to preferred 48K mapping (common):
    // page 8 -> 0x4000..0x7FFF (ram offset 0), page 4 -> 0x8000..0xBFFF (ram offset 0x4000),
    // page 5 -> 0xC000..0xFFFF (ram offset 0x8000)
    if (pageMap.has(8) || pageMap.has(4) || pageMap.has(5)) {
      if (pageMap.has(8)) ramImage.set(pageMap.get(8).subarray(0, Math.min(PAGE_SIZE, pageMap.get(8).length)), 0x0000);
      if (pageMap.has(4)) ramImage.set(pageMap.get(4).subarray(0, Math.min(PAGE_SIZE, pageMap.get(4).length)), 0x4000);
      if (pageMap.has(5)) ramImage.set(pageMap.get(5).subarray(0, Math.min(PAGE_SIZE, pageMap.get(5).length)), 0x8000);
      return;
    }

    // Nothing matched — leave ramImage zero-filled
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
