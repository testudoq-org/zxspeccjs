import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from '../../src/memory.mjs';

describe('Memory contention (JSSpeccy-style table)', () => {
  let mem;
  let fakeCpu;
  beforeEach(() => {
    mem = new Memory({ model: '48k' });
    fakeCpu = { tstates: 0, frameStartTstates: 0 };
    mem.attachCPU(fakeCpu);
  });

  it('applies highest contention (6) at first contended T-state', () => {
    // FIRST contended tstate is 14336 => extra should be 6
    fakeCpu.tstates = mem._firstContended;
    const extra = mem._applyContention(0x4000);
    expect(extra).toBe(6);
    expect(mem.lastContention()).toBe(6);
    expect(fakeCpu.tstates).toBe(mem._firstContended + 6);
  });

  it('returns 0 when sequence index == 7 inside pixel fetch region', () => {
    // choose lineT such that (lineT & 7) == 7 -> value should be 0
    const frameT = mem._firstContended + 7; // seq == 7
    fakeCpu.tstates = frameT;
    const extra = mem._applyContention(0x4000);
    expect(extra).toBe(0);
    expect(mem.lastContention()).toBe(0);
  });

  it('returns 0 outside active display region', () => {
    fakeCpu.tstates = 0; // before FIRST_CONTENDED
    const extra = mem._applyContention(0x4000);
    expect(extra).toBe(0);
    expect(mem.lastContention()).toBe(0);
  });
});
