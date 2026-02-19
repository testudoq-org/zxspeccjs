import { describe, it, expect } from 'vitest';

if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('applySnapshot primary-register split helpers', () => {
  it('restorePcAndSp sets only PC and SP', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // set some non-default values first
    emu.cpu.PC = 0x0000; emu.cpu.SP = 0xffff; emu.cpu.A = 0x12;

    emu._applySnapshot_restorePcAndSp({ PC: 0x4242, SP: 0x2000 });

    expect(emu.cpu.PC).toBe(0x4242);
    expect(emu.cpu.SP).toBe(0x2000);
    // ensure unrelated registers unchanged
    expect(emu.cpu.A).toBe(0x12);
  });

  it('restore8bitRegisters sets A,F,B,C,D,E,H,L', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu._applySnapshot_restore8bitRegisters({ A: 0xAA, F: 0x55, B: 1, C: 2, D: 3, E: 4, H: 5, L: 6 });

    expect(emu.cpu.A).toBe(0xAA);
    expect(emu.cpu.F).toBe(0x55);
    expect(emu.cpu.B).toBe(1);
    expect(emu.cpu.C).toBe(2);
    expect(emu.cpu.D).toBe(3);
    expect(emu.cpu.E).toBe(4);
    expect(emu.cpu.H).toBe(5);
    expect(emu.cpu.L).toBe(6);
  });

  it('restoreIndexAndFlags sets IX,IY,I,R,IFF1,IFF2,IM', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu._applySnapshot_restoreIndexAndFlags({ IX: 0x1234, IY: 0x5678, I: 0x7f, R: 0x11, IFF1: true, IFF2: false, IM: 2 });

    expect(emu.cpu.IX).toBe(0x1234);
    expect(emu.cpu.IY).toBe(0x5678);
    expect(emu.cpu.I).toBe(0x7f);
    expect(emu.cpu.R).toBe(0x11);
    expect(emu.cpu.IFF1).toBe(true);
    expect(emu.cpu.IFF2).toBe(false);
    expect(emu.cpu.IM).toBe(2);
  });
});