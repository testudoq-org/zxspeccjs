import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
// bring in Emulator to access _applyIOContention
import { Emulator } from '../../src/main.mjs';

describe('I/O contention (timing-accurate)', () => {
  it('counts memory-table contention inside ULA contended + ULA-port sequence', () => {
    const mem = new Memory({ model: '48k', contention: true });
    const cpu = { tstates: 0, frameStartTstates: 0 };
    mem.attachCPU(cpu);

    // Construct a minimal Emulator wrapper to call _applyIOContention
    const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
    emu.cpu = cpu;
    emu.memory = mem;

    // Set CPU into first contended T-state (phase 0) so first _applyContention -> 6
    cpu.tstates = mem._firstContended; // 14335

    const before = cpu.tstates;
    // port 0x40FE -> high byte 0x40 contended; LSB 0 => ULA port
    emu._applyIOContention(0x40FE);

    const delta = cpu.tstates - before;
    // Expect: memory._applyContention at phase0 -> 6
    // + explicit +1
    // memory._applyContention at phase1 -> 5
    // + explicit +3
    expect(delta).toBe(6 + 1 + 5 + 3);
  });

  it('applies four contention checks for contended high-byte & non-ULA port', () => {
    const mem = new Memory({ model: '48k', contention: true });
    const cpu = { tstates: 0, frameStartTstates: 0 };
    mem.attachCPU(cpu);
    const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
    emu.cpu = cpu;
    emu.memory = mem;

    // Align to phase 0 so contention sequence is [6,5,4,3] for four calls
    cpu.tstates = mem._firstContended; // phase 0
    const before = cpu.tstates;
    emu._applyIOContention(0x40FF); // non-ULA (LSB=1)

    // total delta should be sum of contentionTable values at frameT, frameT+1, frameT+2, frameT+3
    const expected = mem._contentionTable[mem._firstContended] + mem._contentionTable[mem._firstContended + 1]
      + mem._contentionTable[mem._firstContended + 2] + mem._contentionTable[mem._firstContended + 3]
      // plus the explicit +1 increments after each _applyContention call
      + 4; // four explicit +1

    expect(cpu.tstates - before).toBe(expected);
  });
});