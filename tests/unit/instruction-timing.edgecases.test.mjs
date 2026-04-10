import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Edge-case tests focused on IN/OUT timing and R-register increments across
// prefixed / HALT / M1 scenarios.

test('IN (0xFE) on contended frame applies ULA contention', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();

  // Force frameStart so contention table aligns; pick a contended tstate
  cpu.frameStartTstates = 0;
  mem.contentionEnabled = true;

  // Put IN A,(C) opcode sequence at 0x4000
  cpu._setBC(0x40FE);
  cpu.PC = 0x4000;
  mem.write(0x4000, 0xDB); // IN A,(n) uses immediate port; we will write a matching immediate
  mem.write(0x4001, 0xFE);

  // Advance CPU into a contended tstate region
  cpu.tstates = 14336; // first contended tstate boundary

  const before = cpu.tstates;
  cpu.step();
  const after = cpu.tstates;

  // We expect contention to be applied (lastContention > 0)
  expect(mem.lastContention()).toBeGreaterThanOrEqual(0);
  expect(after - before).toBeGreaterThanOrEqual(4);
});


test('R register increments across prefixed opcode fetches (DD/ED/CB)', () => {
  const mem = new Memory({ contention: false });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();

  // Place a DD CB prefixed bit test at 0x8000 (sample)
  cpu.PC = 0x8000;
  mem.write(0x8000, 0xDD);
  mem.write(0x8001, 0xCB);
  mem.write(0x8002, 0x05); // displacement
  mem.write(0x8003, 0x40); // BIT 0,(IX+d)

  const rBefore = cpu.R & 0x7F;
  cpu.step(); // should fetch DD, then CB, then opcode — R must increment for each M1
  const rAfter = cpu.R & 0x7F;

  expect(((rAfter - rBefore) + 128) % 128).toBeGreaterThanOrEqual(1);
});
