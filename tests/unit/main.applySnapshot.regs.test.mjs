import { describe, it, expect } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator.applySnapshot - register restore', () => {
  it('restores primary CPU registers from snapshot', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const regs = { PC: 0x1234, SP: 0xC000, A: 0x12, F: 0x34, B: 0x56, C: 0x78, D: 0x9a, E: 0xbc, H: 0xde, L: 0xf0, IX: 0x4242, IY: 0x4243, I: 0x7f, R: 0x55, IFF1: true, IFF2: false, IM: 2 };
    const parsed = { snapshot: { registers: regs } };

    const ok = await emu.applySnapshot(parsed, { fileName: 'regs', autoStart: false });
    expect(ok).toBe(true);

    expect(emu.cpu.PC).toBe(0x1234);
    expect(emu.cpu.SP).toBe(0xC000);
    expect(emu.cpu.A).toBe(0x12);
    expect(emu.cpu.F).toBe(0x34);
    expect(emu.cpu.B).toBe(0x56);
    expect(emu.cpu.C).toBe(0x78);
    expect(emu.cpu.D).toBe(0x9a);
    expect(emu.cpu.E).toBe(0xbc);
    expect(emu.cpu.H).toBe(0xde);
    expect(emu.cpu.L).toBe(0xf0);
    expect(emu.cpu.IX).toBe(0x4242);
    expect(emu.cpu.IY).toBe(0x4243);
    expect(emu.cpu.I).toBe(0x7f);
    expect(emu.cpu.R).toBe(0x55);
    expect(emu.cpu.IFF1).toBe(true);
    expect(emu.cpu.IFF2).toBe(false);
    expect(emu.cpu.IM).toBe(2);
  });

  it('restores alternate (primed) registers when provided', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const regs = { A2: 0x11, F2: 0x22, B2: 0x33, C2: 0x44, D2: 0x55, E2: 0x66, H2: 0x77, L2: 0x88 };
    const parsed = { snapshot: { registers: regs } };

    const ok = await emu.applySnapshot(parsed, { fileName: 'altregs', autoStart: false });
    expect(ok).toBe(true);

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
