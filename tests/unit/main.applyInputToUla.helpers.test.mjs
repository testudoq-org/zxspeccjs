import { describe, it, expect } from 'vitest';

// Minimal DOM shims
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('applyInputToULA helpers', () => {
  it('_inputMatrixRowToUlaRow maps 5-bit input to 8-bit ULA row', async () => {
    const emu = await makeEmu();
    // 0x00 -> 0xE0 (upper 3 bits set)
    expect(emu._inputMatrixRowToUlaRow(0x00)).toBe(0xE0);
    // 0x1f -> 0xff
    expect(emu._inputMatrixRowToUlaRow(0x1f)).toBe(0xff);
    // mixed bits
    expect(emu._inputMatrixRowToUlaRow(0x0a)).toBe(0xEA);
  });

  it('_applyInputToULA writes mapped rows into ula.keyMatrix and sets test hook', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // Prepare input matrix with known values
    emu.input.matrix = [0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07];
    // Ensure ula.keyMatrix exists
    emu.ula = emu.ula || {};
    emu.ula.keyMatrix = new Uint8Array(8);

    window.__TEST__ = {};

    emu._applyInputToULA();

    expect(Array.from(emu.ula.keyMatrix)).toEqual(emu.input.matrix.map(v => (v & 0x1f) | 0xE0));
    expect(window.__TEST__.lastAppliedKeyMatrix).toEqual(Array.from(emu.ula.keyMatrix));
  });
});