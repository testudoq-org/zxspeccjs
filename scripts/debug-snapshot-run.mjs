// minimal DOM shims for Node
if (typeof globalThis.window === 'undefined') globalThis.window = {};
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

import { Emulator } from '../src/main.mjs';

(async () => {
  const emu = new Emulator({ canvas: { width:320, height:240, getContext:() => ({ createImageData: () => ({ data: new Uint8ClampedArray(320*240*4) }), getImageData: () => ({ data: new Uint8ClampedArray([0,0,0,255]) }) }), style:{}, toDataURL: () => '' }, statusEl: {} });
  await emu._createCore(null);

  const topRow = 184, col = 1;
  for (let i = 0; i < 8; i++) {
    const y = topRow + i;
    const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
    const addr = 0x4000 + rel;
    emu.memory.write(addr, 0x20 + i);
  }

  const expectedBitmap = [];
  for (let i = 0; i < 8; i++) {
    const y = topRow + i;
    const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
    const addr = 0x4000 + rel;
    expectedBitmap.push(emu.readRAM(addr));
  }

  const realReadROM = emu.readROM.bind(emu);
  const base = 0x3C08;
  emu.readROM = (addr) => {
    if (addr >= base && addr < base + 8) return expectedBitmap[addr - base];
    return realReadROM(addr);
  };

  const s = emu.snapshotGlyph(col, topRow);
  console.log('bitmapBytes:', s.bitmapBytes);
  console.log('expectedBitmap:', expectedBitmap);
  console.log('snapshotGlyph result:', s);
  const foundDirect = emu._snapshot_findRomMatch(expectedBitmap);
  console.log('_snapshot_findRomMatch(expectedBitmap) =>', foundDirect && foundDirect.toString(16));
})();