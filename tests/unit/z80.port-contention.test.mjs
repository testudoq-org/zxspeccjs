/* eslint-env node, browser */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

describe('Z80 port-contention helper', () => {
  it('applies I/O contention when cpu.io does NOT handle it', () => {
    const mem = new Memory({ model: '48k' });
    const cpu = new Z80(mem);
    mem.attachCPU(cpu);
    cpu.reset();
    cpu.frameStartTstates = 0;
    mem.contentionEnabled = true;

    let applyCalls = 0;
    mem._applyContention = function() { applyCalls++; return 0; };

    // Prepare OUT (C),A (ED 0x79) against contended high-byte + ULA (0x40FE)
    cpu._setBC(0x40FE);
    cpu.A = 0x12;
    cpu.PC = 0x4000;
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0x79); // OUT (C),A

    const start = cpu.tstates;
    cpu.step(); // execute OUT (C),A

    expect(applyCalls, 'memory._applyContention should be invoked by Z80 helper').toBeGreaterThan(0);
    expect(cpu.tstates - start, 'tstates should increase beyond base instruction cost').toBeGreaterThan(12);
  });

  it('does NOT double-apply when cpu.io advertises contention handling', () => {
    const mem = new Memory({ model: '48k' });
    const cpu = new Z80(mem);
    mem.attachCPU(cpu);
    cpu.reset();
    cpu.frameStartTstates = 0;
    mem.contentionEnabled = true;

    // Spy mem._applyContention but DO NOT assert global call-count here because other
    // memory activity (instruction fetch) may legitimately call it.
    mem._applyContention = function() { return 0; };

    // Mock io that advertises it already applies contention
    cpu.io = { write: () => {}, _appliesContention: true };

    cpu._setBC(0x40FE);
    cpu.A = 0x34;
    cpu.PC = 0x4000;
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0x79); // OUT (C),A

    // Monkey-patch cpu._applyPortContention to ensure Z80 helper isn't invoked
    let helperCalled = false;
    const origHelper = cpu._applyPortContention.bind(cpu);
    cpu._applyPortContention = function(p) { helperCalled = true; return origHelper(p); };

    const start = cpu.tstates;
    cpu.step();

    expect(helperCalled, 'Z80 helper should NOT be called when IO adapter advertises contention handling').toBe(false);
    // instruction base cost must still be charged
    expect(cpu.tstates - start).toBe(12);
  });
});
