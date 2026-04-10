import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { FrameBuffer } from '../../src/frameBuffer.mjs';

// Verifies the ZX Spectrum non-linear screen mapping is correct and stable
// (prevents regressions that produce "half the game" symptoms).
describe('Screen non-linear mapping (regression test)', () => {
  it('maps y=0,64,128 to distinct bitmap offsets in frame buffer', () => {
    const mem = new Memory({ model: '48k' });

    // Write distinct marker bytes into the three 64-line blocks
    // Offsets are relative to RAM page1 (flatRam offset 0..0x17FF)
    // y=0 -> bitmap offset 0
    // y=64 -> bitmap offset 2048 (0x800)
    // y=128 -> bitmap offset 4096 (0x1000)
    mem.pages[1][0x0000] = 0x11; // top block, first byte
    mem.pages[1][0x0800] = 0x22; // middle block, same column
    mem.pages[1][0x1000] = 0x33; // bottom block, same column

    // Also set matching attribute bytes so renderer has sane attr values
    // Attribute area starts at RAM offset 0x1800 (within page1)
    mem.pages[1][0x1800] = 0x07; // attr for first cell
    mem.pages[1][0x1801] = 0x07; // attr for second cell (safety)

    // Keep linear _flatRam in sync when pages are mutated directly in tests
    if (typeof mem._syncFlatRamFromBanks === 'function') mem._syncFlatRamFromBanks();
    const fb = new FrameBuffer();
    fb.attach(mem);
    fb.generateFromMemory();

    const buf = fb.getBuffer();

    // Compute buffer positions: top border occupies 24 * 160 bytes
    const topBorderBytes = 24 * 160;
    // Each main-screen line contributes 96 bytes to the framebuffer (16 left border, 32*(bitmap+attr)=64, 16 right border)
    const lineStride = 96;
    // Within a line the first bitmap cell begins after 16 left-border bytes
    const firstBitmapOffsetInLine = 16;

    // xByte = 0 (first cell)
    const xByte = 0;

    const idxY0 = topBorderBytes + (0 * lineStride) + firstBitmapOffsetInLine + (xByte * 2);
    const idxY64 = topBorderBytes + (64 * lineStride) + firstBitmapOffsetInLine + (xByte * 2);
    const idxY128 = topBorderBytes + (128 * lineStride) + firstBitmapOffsetInLine + (xByte * 2);

    expect(buf[idxY0]).toBe(0x11);
    expect(buf[idxY64]).toBe(0x22);
    expect(buf[idxY128]).toBe(0x33);
  });
});
