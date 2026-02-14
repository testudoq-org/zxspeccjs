import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from '../../src/memory.mjs';
let Emulator, Z80;

async function makeCore() {
  if (!Emulator) {
    const m = await import('../../src/main.mjs');
    Emulator = m.Emulator;
  }
  if (!Z80) {
    const z = await import('../../src/z80.mjs');
    Z80 = z.Z80;
  }
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
  emu.cpu = cpu;
  emu.memory = mem;
  return { emu, cpu, mem };
}

describe('I/O contention patterns', () => {
  let emu, cpu, mem, applyCalls;
  beforeEach(async () => {
    ({ emu, cpu, mem } = await makeCore());
    // stub _applyContention to make IO contention deterministic and observable
    applyCalls = 0;
    mem._applyContention = function() { applyCalls++; return 0; };
    // ensure contention detection is enabled
    mem.contentionEnabled = true;
  });

  it('high-byte contended + ULA port triggers C:1, C:3 pattern', () => {
    cpu.tstates = 100;
    const start = cpu.tstates;
    // port 0x40FE -> high byte 0x40 (contended), LSB 0 (ULA)
    emu._applyIOContention(0x40FE);
    // expected explicit increments: +1 and +3 = +4 (contention stub returns 0)
    expect(cpu.tstates - start).toBe(4);
    // memory._applyContention should have been invoked twice
    expect(applyCalls).toBe(2);
  });

  it('high-byte contended + non-ULA port triggers four contention checks', () => {
    cpu.tstates = 200;
    const start = cpu.tstates;
    emu._applyIOContention(0x40FF); // high byte contended, LSB=1 non-ULA
    // expected explicit increments: 4 × +1 = +4
    expect(cpu.tstates - start).toBe(4);
    expect(applyCalls).toBe(4);
  });

  it('high-byte uncontended + ULA port triggers N:1 + C:3', () => {
    cpu.tstates = 300;
    const start = cpu.tstates;
    emu._applyIOContention(0x00FE); // high byte 0x00 (uncontended), LSB=0 (ULA)
    // expected explicit increments: +1 +3 = +4 (and one contention invocation)
    expect(cpu.tstates - start).toBe(4);
    expect(applyCalls).toBe(1);
  });

  it('high-byte uncontended + non-ULA port does not add contention', () => {
    cpu.tstates = 400;
    const start = cpu.tstates;
    emu._applyIOContention(0x00FF); // uncontended high byte & non-ULA
    expect(cpu.tstates - start).toBe(0);
    expect(applyCalls).toBe(0);
  });
});
