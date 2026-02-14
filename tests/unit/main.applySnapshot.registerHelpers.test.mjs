import { describe, it, expect } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('applySnapshot register helper unit tests', () => {
  it('restorePrimaryRegisters sets core registers correctly', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const regs = { PC: 0x1111, SP: 0xC100, A: 0xAA, F: 0x55, B: 0x01, C: 0x02, D: 0x03, E: 0x04, H: 0x05, L: 0x06, IX: 0x2222, IY: 0x3333, I: 0x7f, R: 0x10, IFF1: true, IFF2: false, IM: 1 };
    emu._applySnapshot_restorePrimaryRegisters(regs);

    expect(emu.cpu.PC).toBe(0x1111);
    expect(emu.cpu.SP).toBe(0xC100);
    expect(emu.cpu.A).toBe(0xAA);
    expect(emu.cpu.F).toBe(0x55);
    expect(emu.cpu.B).toBe(0x01);
    expect(emu.cpu.C).toBe(0x02);
    expect(emu.cpu.D).toBe(0x03);
    expect(emu.cpu.E).toBe(0x04);
    expect(emu.cpu.H).toBe(0x05);
    expect(emu.cpu.L).toBe(0x06);
    expect(emu.cpu.IX).toBe(0x2222);
    expect(emu.cpu.IY).toBe(0x3333);
    expect(emu.cpu.I).toBe(0x7f);
    expect(emu.cpu.R).toBe(0x10);
    expect(emu.cpu.IFF1).toBe(true);
    expect(emu.cpu.IFF2).toBe(false);
    expect(emu.cpu.IM).toBe(1);
  });

  it('restoreAlternateRegisters sets primed registers correctly', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const regs = { A2: 0x11, F2: 0x22, B2: 0x33, C2: 0x44, D2: 0x55, E2: 0x66, H2: 0x77, L2: 0x88 };
    emu._applySnapshot_restoreAlternateRegisters(regs);

    expect(emu.cpu.A_).toBe(0x11);
    expect(emu.cpu.F_).toBe(0x22);
    expect(emu.cpu.B_).toBe(0x33);
    expect(emu.cpu.C_).toBe(0x44);
    expect(emu.cpu.D_).toBe(0x55);
    expect(emu.cpu.E_).toBe(0x66);
    expect(emu.cpu.H_).toBe(0x77);
    expect(emu.cpu.L_).toBe(0x88);
  });
});
