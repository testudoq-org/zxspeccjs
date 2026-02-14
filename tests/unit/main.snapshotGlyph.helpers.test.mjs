import { describe, it, expect } from 'vitest';

// Minimal DOM shims
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('snapshotGlyph helpers', () => {
  it('_snapshot_readBitmapBytes reads 8 addresses/bytes for a column', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const topRow = 184, col = 2;
    for (let i = 0; i < 8; i++) {
      const y = topRow + i;
      const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
      const addr = 0x4000 + rel;
      emu.memory.write(addr, 0x10 + i);
    }

    const out = emu._snapshot_readBitmapBytes(topRow, col);
    expect(out.bitmapAddrs).toHaveLength(8);
    expect(out.bitmapBytes).toHaveLength(8);
    expect(out.bitmapBytes[0]).toBe(0x10);
    expect(out.bitmapBytes[7]).toBe(0x17);
  });

  it('_snapshot_findRomMatch returns rom address when readROM matches bitmap', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const glyph = [1,2,3,4,5,6,7,8];
    // stub readROM to return glyph at 0x3C00
    const realReadROM = emu.readROM.bind(emu);
    emu.readROM = (addr) => {
      const base = 0x3C00;
      if (addr >= base && addr < base + 8) return glyph[addr - base];
      return realReadROM(addr);
    };

    const found = emu._snapshot_findRomMatch(glyph);
    expect(found).toBe(0x3C00);

    // restore
    emu.readROM = realReadROM;
  });

  it('snapshotGlyph composes helpers and reports romMatchAddr when available', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const topRow = 184, col = 1;
    // populate screen bitmap bytes
    for (let i = 0; i < 8; i++) {
      const y = topRow + i;
      const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
      const addr = 0x4000 + rel;
      emu.memory.write(addr, 0x20 + i);
    }

    // Write the expected glyph into the ROM area so `readROM` returns a match
    const base = 0x3C08;
    const expectedBitmap = [];
    for (let i = 0; i < 8; i++) {
      const y = topRow + i;
      const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
      const addr = 0x4000 + rel;
      const v = emu.readRAM(addr);
      expectedBitmap.push(v);
    }
    // write directly into ROM image used by emu.readROM()
    for (let j = 0; j < 8; j++) emu.memory.pages[0][base + j] = expectedBitmap[j];

    const s = emu.snapshotGlyph(col, topRow);
    expect(s.bitmapBytes).toHaveLength(8);
    expect(s.matchToRom).toBe(true);
    expect(s.romMatchAddr).toBe(base);
  });
});