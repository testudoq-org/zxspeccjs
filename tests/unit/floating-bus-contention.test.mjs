import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import { Emulator } from '../../src/main.mjs';

describe('Floating bus under contention', () => {
  it('floating bus returns bitmap byte and contention is applied on read', () => {
    const mem = new Memory({ model: '48k', contention: true });
    const cpu = new Z80(mem);
    mem.attachCPU(cpu);
    cpu.reset();

    const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
    emu.memory = mem;
    emu.cpu = cpu;

    // place a known byte in bitmap and ensure contention is active at the test tstate
    const y = 0, cell = 0;
    const bitmapAddr = 0x4000 | ((y & 0xC0) << 5) | ((y & 0x07) << 8) | ((y & 0x38) << 2) | cell;
    mem.write(bitmapAddr, 0xAB);

    // phase 0 (first pixel tstate) -> memory contention value 6
    cpu.frameStartTstates = 0;
    cpu.tstates = mem._firstContended; // 14336

    const before = cpu.tstates;
    const v = emu._readFloatingBus();
    const after = cpu.tstates;

    expect(v).toBe(0xAB);
    // read triggered memory._applyContention -> expect lastContention > 0
    expect(mem.lastContention()).toBeGreaterThan(0);
    // cpu.tstates should have advanced by whatever contention was applied (>=0)
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
