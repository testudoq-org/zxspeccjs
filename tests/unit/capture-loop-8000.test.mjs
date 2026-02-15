import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Reproduce capture_jetpac_trace scenario: program at 0x8000, run one frame
test('Program at 0x8000 writes two consecutive screen bytes within one frame', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);

  // Program placed at 0x8000 (RAM page 2 offset 0x0000)
  // LD HL,0x4000; LD A,0xAA; LD B,0x02; loop: LD (HL),A; INC HL; OUT (0xFE),A; DJNZ loop; JP 0x8003
  const code = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x02, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];
  const base = 0x8000 - 0x8000; // page2 offset for 0x8000 in ram.pages[2]
  for (let i = 0; i < code.length; i++) mem.pages[2][base + i] = code[i];

  // Set CPU registers to match capture harness
  cpu.PC = 0x8000;
  cpu.A = 0xAA;
  cpu.B = 0x10; // 16 iterations
  // Ensure deterministic logging
  cpu._microTraceEnabled = true;
  cpu._microLog = [];
  mem._memWrites = [];
  // Simulate start-of-frame
  cpu.frameStartTstates = 0;
  cpu.tstates = 0;

  // Run one frame (69888 t-states)
  cpu.runFor(69888);


  const writes = (mem._memWrites || []).filter(w => w.addr === 0x4000 || w.addr === 0x4001);
  expect(writes.map(w => w.addr).sort()).toEqual(expect.arrayContaining([0x4000, 0x4001]));
});