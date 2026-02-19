import { describe, it, expect } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('applySnapshot RAM helper unit tests', () => {
  it('ramRestore_full copies 48K into pages 1..3', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const ram = new Uint8Array(0xC000);
    for (let i = 0; i < ram.length; i++) ram[i] = i & 0xff;

    emu._applySnapshot_ramRestore_full(ram);

    expect(emu.memory.pages[1][0]).toBe(ram[0]);
    expect(emu.memory.pages[2][0]).toBe(ram[0x4000]);
    expect(emu.memory.pages[3][0]).toBe(ram[0x8000]);
  });

  it('ramRestore_partial copies sequential bytes into pages', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const partialLen = 0x5000; // spans page1 fully and part of page2
    const ram = new Uint8Array(partialLen);
    for (let i = 0; i < ram.length; i++) ram[i] = (0xA0 + (i & 0xff));

    emu._applySnapshot_ramRestore_partial(ram);

    expect(emu.memory.pages[1][0x0]).toBe(ram[0]);
    expect(emu.memory.pages[1][0x3fff]).toBe(ram[0x3fff]);
    expect(emu.memory.pages[2][0x0]).toBe(ram[0x4000]);
    // remainder of `ram` is copied into page2 — ensure a non-zero byte was copied
    expect(emu.memory.pages[2][0x100]).toBe(ram[0x4100]); // copied into page2
  });
});
