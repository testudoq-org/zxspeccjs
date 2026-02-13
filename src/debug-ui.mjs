/* Debug UI helpers extracted from main.mjs to improve testability and reduce inner functions. */

/**
 * Gather ROM info (search for 0x7F signature bytes)
 * @returns {{romHas7F:boolean, romOffsets:number[]}}
 */
export function gatherRomInfo() {
  const out = { romHas7F: false, romOffsets: [] };
  try {
    if (typeof window.__ZX_DEBUG__?.readROM === 'function') {
      for (let i = 0x1530; i < 0x1550; i++) {
        if (window.__ZX_DEBUG__.readROM(i) === 0x7F) {
          out.romHas7F = true;
          out.romOffsets.push(i);
        }
      }
    }
  } catch (e) { /* best-effort */ }
  return out;
}

/**
 * Read CHARS system variable and return [lo,hi] or null
 * @returns {number[]|null}
 */
export function gatherCharsInfo() {
  const out = {};
  try {
    out.CHARS = window.__ZX_DEBUG__?.peekMemory ? window.__ZX_DEBUG__.peekMemory(0x5C36, 2) : null;
    out.CHARSptr = (Array.isArray(out.CHARS) ? ((out.CHARS[1] << 8) | out.CHARS[0]) : null);
    out.emu_lastChars = (window.emulator && typeof window.emulator._lastChars !== 'undefined') ? window.emulator._lastChars : null;
  } catch (e) { return { CHARS: null, CHARSptr: null, emu_lastChars: null }; }
  return out;
}

/**
 * Return 8 glyph bytes for character 0x7F (best effort)
 * @param {number} ptr - character set base pointer
 * @returns {Array<number|null>} 8 bytes
 */
export function gatherGlyph(ptr = 0x3C00) {
  const out = [];
  const base = ptr || 0x3C00;
  for (let i = 0; i < 8; i++) {
    let v = null;
    try {
      v = window.__ZX_DEBUG__?.readRAM ?
        window.__ZX_DEBUG__.readRAM((base + 0x7F * 8 + i) & 0xffff) :
        (window.__ZX_DEBUG__?.readMemory ? window.__ZX_DEBUG__.readMemory((base + 0x7F * 8 + i) & 0xffff) : null);
    } catch (e) { v = null; }
    out.push(v);
  }
  return out;
}

/**
 * Scan the bottom text rows for 0x7F usage
 * @returns {{screenHas7F:boolean}}
 */
export function gatherScreenScan() {
  const out = { screenHas7F: false };
  try {
    if (window.__ZX_DEBUG__?.readRAM) {
      for (let col = 0; col < 32; col++) {
        for (let r = 184; r < 192; r++) {
          const rel = ((r & 0xC0) << 5) + ((r & 0x07) << 8) + ((r & 0x38) << 2) + col;
          if (window.__ZX_DEBUG__.readRAM(rel) === 0x7F) out.screenHas7F = true;
        }
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

/**
 * Inspect a small canvas region and report whether any pixel differs from the background
 * @returns {{canvasNonBg:boolean}}
 */
export function gatherCanvasCheck() {
  const out = { canvasNonBg: false };
  try {
    const canvas = document.getElementById('screen');
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const sx = Math.max(0, Math.floor(w * 0.05));
      const sy = Math.max(0, Math.floor(h * 0.86));
      const sw = Math.min(32, w - sx), sh = Math.min(24, h - sy);
      const img = ctx.getImageData(sx, sy, sw, sh);
      const d = img.data;
      const br = d[0], bg = d[1], bb = d[2];
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== br || d[i + 1] !== bg || d[i + 2] !== bb) { out.canvasNonBg = true; break; }
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

/**
 * Combined diagnostic gather function used by the UI
 * @returns {Promise<Object>} diagnostic object
 */
export async function gatherDiag() {
  const out = { time: (new Date()).toISOString(), debugAvailable: Boolean(window.__ZX_DEBUG__) };
  try { Object.assign(out, gatherRomInfo()); } catch (e) { out.romErr = String(e); }
  try { Object.assign(out, gatherCharsInfo()); } catch (e) { out.CHARS = 'err'; }
  try { out.glyph = gatherGlyph(out.CHARSptr || 0x3C00); } catch (e) { out.glyphErr = String(e); }
  try { Object.assign(out, gatherScreenScan()); } catch (e) { out.screenScanErr = String(e); }
  try { Object.assign(out, gatherCanvasCheck()); } catch (e) { out.canvasErr = String(e); }
  return out;
}
