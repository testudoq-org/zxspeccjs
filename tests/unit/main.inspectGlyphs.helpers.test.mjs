import { describe, it, expect } from 'vitest';

// Minimal DOM shims
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('inspectBottomGlyphs helper unit tests', () => {
  it('_inspect_getCharsPointer reads CHARS pointer from RAM (0x5C36/0x5C37)', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // write lo/hi bytes into RAM at 0x5C36/0x5C37
    const lo = 0x34, hi = 0x12; // pointer = 0x1234
    emu.memory.write(0x5C36, lo);
    emu.memory.write(0x5C37, hi);

    const ptr = emu._inspect_getCharsPointer();
    expect(ptr).toBe((hi << 8) | lo);
  });

  it('_inspect_readColumnRows returns 8 row entries for a column (topRow=184, col=0)', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const topRow = 184, col = 0;
    // populate screen memory for the 8 rows with distinct values for test
    for (let r = 0; r < 8; r++) {
      const y = topRow + r;
      const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
      const addr = 0x4000 + rel;
      emu.memory.write(addr, 0x10 + r);
    }

    const rows = emu._inspect_readColumnRows(topRow, col);
    expect(rows).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(rows[i]).toHaveProperty('y', topRow + i);
      expect(rows[i]).toHaveProperty('addr');
      expect(rows[i]).toHaveProperty('val', 0x10 + i);
    }
  });

  it('_inspect_readAttributeByte returns attribute address and byte', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const topRow = 184, col = 5;
    const attrAddr = 0x5800 + (Math.floor(topRow / 8) * 32) + col;
    emu.memory.write(attrAddr, 0xAB);

    const out = emu._inspect_readAttributeByte(topRow, col);
    expect(out.attrAddr).toBe(attrAddr);
    expect(out.attrByte).toBe(0xAB);
  });

  it('_inspect_readGlyphBytesAtChars and _inspect_readGlyphBytesAtRom + _inspect_glyphsEqual', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // write a small custom charset into RAM (charsPtr = 0x3D00)
    const charsPtr = 0x3D00;
    const code = 0x7F;
    const baseAddr = (charsPtr + code * 8) & 0xffff;
    const glyph = [1,2,3,4,5,6,7,8];
    for (let i = 0; i < 8; i++) emu.memory.write((baseAddr + i) & 0xffff, glyph[i]);

    const fromChars = emu._inspect_readGlyphBytesAtChars(charsPtr, code);
    expect(fromChars).toEqual(glyph);

    // ROM glyph read (readROM) should return data (non-error) and compare works
    const fromRom = emu._inspect_readGlyphBytesAtRom(code);
    expect(Array.isArray(fromRom)).toBe(true);
    // compare arrays (should be boolean)
    const eq = emu._inspect_glyphsEqual(fromChars, fromChars.slice());
    expect(eq).toBe(true);
  });

  it('_inspect_sampleFrameBufferColumn reads fb bytes when frameBuffer present', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // create fake frameBuffer with a buffer large enough and place known values
    const fb = { buffer: new Uint8Array(30000) };
    const topRow = 184, col = 3;
    // Match the same offsets used in production: topBorderBytes + y * lineStride + 16 + col * 2
    const topBorderBytes = 24 * 160;
    const lineStride = 16 + 64 + 16;
    for (let i = 0; i < 8; i++) {
      const y = topRow + i;
      const bufferPtr = topBorderBytes + y * lineStride + 16 + col * 2;
      fb.buffer[bufferPtr] = 0x77 + i;
    }
    emu.ula = emu.ula || {}; emu.ula.frameBuffer = fb;

    const fbBytes = emu._inspect_sampleFrameBufferColumn(topRow, col);
    expect(fbBytes).toHaveLength(8);
    expect(fbBytes[0]).toBe(0x77);
  });

  it('_inspect_canvasColumnNonBg returns boolean based on canvas getImageData', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // Stub document.getElementById('screen') to provide getContext().getImageData
    globalThis.document.getElementById = () => ({
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray([0,0,0,255]) })
      })
    });

    // If all pixels equal base, helper should report false (no non-bg)
    const allSame = emu._inspect_canvasColumnNonBg(184, 0);
    expect(allSame).toBe(false);

    // Now simulate a differing pixel by returning a different color for one pixel
    let calls = 0;
    globalThis.document.getElementById = () => ({
      getContext: () => ({
        getImageData: () => {
          calls++;
          if (calls === 3) return { data: new Uint8ClampedArray([1,1,1,255]) };
          return { data: new Uint8ClampedArray([0,0,0,255]) };
        }
      })
    });

    const nonBg = emu._inspect_canvasColumnNonBg(184, 0);
    expect(nonBg).toBe(true);
  });
});
