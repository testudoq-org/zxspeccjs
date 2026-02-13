/**
 * Tests for floating bus value returned by Emulator._readFloatingBus
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
// Avoid DOM top-level initializers in main.mjs when running under Node
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
let Emulator;

async function makeCore() {
  if (!Emulator) {
    const m = await import('../../src/main.mjs');
    Emulator = m.Emulator;
  }
  const mem = new Memory({ contention: false });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
  // Attach CPU and memory directly to emulator for isolated test
  emu.cpu = cpu;
  emu.memory = mem;
  return { emu, cpu, mem };
}

describe('Floating bus read semantics', () => {
  it('returns bitmap byte during bitmap phase and attribute during attr phase', async () => {
    const { emu, cpu, mem } = await makeCore();

    const FIRST_PIXEL = 14335;
    // choose y=10, cell=3
    const y = 10;
    const cell = 3;
    const bitmapAddr = 0x4000
      | ((y & 0xC0) << 5)
      | ((y & 0x07) << 8)
      | ((y & 0x38) << 2)
      | cell;

    const attrAddr = 0x5800 + (Math.floor(y / 8) * 32) + cell;

    mem.write(bitmapAddr, 0xAA);
    mem.write(attrAddr, 0x55);

    // bitmap phase: phase 2 (0..3)
    cpu.frameStartTstates = 0;
    const frameT = FIRST_PIXEL + y * 224 + (cell * 8) + 2; // lineT within cell
    cpu.tstates = frameT;
    expect(emu._readFloatingBus()).toBe(0xAA);

    // attribute phase: phase 6 (4..7)
    cpu.tstates = FIRST_PIXEL + y * 224 + (cell * 8) + 6;
    expect(emu._readFloatingBus()).toBe(0x55);
  });

  it('returns 0xFF outside active display and at exact phase boundaries', async () => {
    const { emu, cpu } = await makeCore();
    cpu.frameStartTstates = 0;

    // before first pixel
    cpu.tstates = 14334;
    expect(emu._readFloatingBus()).toBe(0xFF);

    // exactly at first contended T-state - should be treated as active display (bitmap fetch)
    cpu.tstates = 14335;
    // pick a bitmap address for this line and ensure value is returned
    const y = 0, cell = 0;
    const bitmapAddr = 0x4000 | ((y & 0xC0) << 5) | ((y & 0x07) << 8) | ((y & 0x38) << 2) | cell;
    emu.memory.write(bitmapAddr, 0x7A);
    expect(emu._readFloatingBus()).toBe(0x7A);

    // after last scanline
    cpu.tstates = 57408;
    expect(emu._readFloatingBus()).toBe(0xFF);

    // during border/retrace portion of line (first non-pixel tstate)
    cpu.tstates = 14335 + 128;
    expect(emu._readFloatingBus()).toBe(0xFF);
  });
});