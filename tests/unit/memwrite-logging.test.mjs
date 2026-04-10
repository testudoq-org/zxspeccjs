import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Ensure Memory._memWrites is populated when the CPU performs LD (HL),A + INC HL loop
test('Memory logs consecutive LD (HL),A writes into _memWrites', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.attachMemory = mem;

  // Program at 0x4000: LD HL,0x4000; LD A,0xAA; LD B,2; loop: LD (HL),A; INC HL; DJNZ loop; HALT
  const prog = [0x21, 0x00, 0x40, 0x3E, 0xAA, 0x06, 0x02, 0x77, 0x23, 0x10, 0xFB, 0x76];
  // Place program in RAM page (0x4000 region)
  for (let i = 0; i < prog.length; i++) mem.pages[1][i] = prog[i];

  // Execute program by setting PC to 0x4000
  cpu.PC = 0x4000;

  // Step until HALT executed (should perform two writes: 0x4000 and 0x4001)
  for (let i = 0; i < 100; i++) {
    const cycles = cpu.step();
    if (cpu.halted) break;
  }

  // Ensure memory logged writes
  expect(Array.isArray(mem._memWrites)).toBe(true);
  const writes = mem._memWrites.filter(w => w.addr === 0x4000 || w.addr === 0x4001);
  expect(writes.length).toBeGreaterThanOrEqual(2);
  const addrs = writes.map(w => w.addr).sort();
  expect(addrs).toContain(0x4000);
  expect(addrs).toContain(0x4001);
});
