import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Helper to run DDCB/ FDCB sequence: prefix(0xDD/0xFD), 0xCB, d, cbOpcode
function runIndexedCB(mem, cpu, prefix, d, cbOpcode) {
  const pc = 0x4000;
  mem.write(pc, prefix);
  mem.write(pc + 1, 0xCB);
  mem.write(pc + 2, d & 0xFF);
  mem.write(pc + 3, cbOpcode);
  cpu.PC = pc;
  return cpu.step();
}

describe('Z80 DDCB/FDCB index operations (representative)', () => {
  it('RLC (IX+d) rotates memory and sets carry via DDCB', () => {
    const mem = new Memory();
    const cpu = new Z80(mem);
    // Place operand at IX + 0
    const addr = 0x6000;
    cpu.IX = addr;
    mem.write(addr, 0x80);

    // DDCB d=0 opcode RLC = 0x00
    runIndexedCB(mem, cpu, 0xDD, 0x00, 0x00);

    expect(mem.read(addr)).toBe(0x01);
    expect((cpu.F & 0x01)).toBe(1); // carry set
  });

  it('BIT 7,(IY+d) sets Z via FDCB', () => {
    const mem = new Memory();
    const cpu = new Z80(mem);
    const addr = 0x6100;
    cpu.IY = addr;

    // Test bit set
    mem.write(addr, 0x80);
    cpu.F = 0;
    runIndexedCB(mem, cpu, 0xFD, 0x00, 0x7E); // BIT 7,(IY+0)
    expect((cpu.F & 0x40)).toBe(0); // Z cleared

    // Test bit clear
    const mem2 = new Memory();
    const cpu2 = new Z80(mem2);
    cpu2.IY = addr;
    mem2.write(addr, 0x00);
    cpu2.F = 0;
    runIndexedCB(mem2, cpu2, 0xFD, 0x00, 0x7E);
    expect((cpu2.F & 0x40)).toBe(0x40); // Z set
  });
});