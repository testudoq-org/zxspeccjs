import { describe, it, expect, vi } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator.applySnapshot - RAM restore', () => {
  it('applies full 48K RAM snapshot into pages[1..3]', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const ram = new Uint8Array(0xC000);
    for (let i = 0; i < ram.length; i++) ram[i] = (i & 0xff);

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'full', autoStart: false });
    expect(ok).toBe(true);

    // verify page1/page2/page3 were written from ram subarrays
    expect(emu.memory.pages[1][0]).toBe(ram[0]);
    expect(emu.memory.pages[2][0]).toBe(ram[0x4000]);
    expect(emu.memory.pages[3][0]).toBe(ram[0x8000]);
    // spot check an internal value
    expect(emu.memory.pages[2][0x123]).toBe(ram[0x4000 + 0x123]);
  });

  it('applies partial RAM snapshot sequentially into pages', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const partialLen = 0x5000; // spans page1 fully and part of page2
    const ram = new Uint8Array(partialLen);
    for (let i = 0; i < ram.length; i++) ram[i] = (0x80 + (i & 0x7f));

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'partial', autoStart: false });
    expect(ok).toBe(true);

    // page1 filled completely
    expect(emu.memory.pages[1][0x0]).toBe(ram[0]);
    expect(emu.memory.pages[1][0x3fff]).toBe(ram[0x3fff]);
    // page2 first byte should equal ram[0x4000]
    expect(emu.memory.pages[2][0x0]).toBe(ram[0x4000]);
    // bytes beyond provided length should remain unchanged (default 0)
    expect(emu.memory.pages[2][0x1000]).toBe(0);
  });

  it('calls _syncFlatRamFromBanks when _flatRam is present', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // set marker and spy
    emu.memory._flatRam = true;
    emu.memory._syncFlatRamFromBanks = vi.fn();

    const ram = new Uint8Array(0x4000);
    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'flat', autoStart: false });
    expect(ok).toBe(true);
    expect(emu.memory._syncFlatRamFromBanks).toHaveBeenCalled();
  });
});
