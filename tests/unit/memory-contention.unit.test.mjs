import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from '../../src/memory.mjs';

describe('memory contention — CPU tstates for contended reads (unit)', () => {
  let mem;
  let fakeCpu;

  beforeEach(() => {
    mem = new Memory({ model: '48k' });
    fakeCpu = { tstates: 0, frameStartTstates: 0 };
    mem.attachCPU(fakeCpu);
  });

  it('increments CPU.tstates when reading from contended area (0x4000)', () => {
    // position CPU at the first contended t-state
    fakeCpu.tstates = mem._firstContended;
    const before = fakeCpu.tstates;

    const v = mem.read(0x4000);
    expect(typeof v).toBe('number');
    expect(fakeCpu.tstates).toBeGreaterThan(before);
    expect(mem.lastContention()).toBeGreaterThanOrEqual(0);
  });

  it('does not change CPU.tstates when reading an uncontended address (0x2000)', () => {
    fakeCpu.tstates = 0;
    mem.read(0x2000);
    expect(fakeCpu.tstates).toBe(0);
  });
});
