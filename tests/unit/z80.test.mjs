import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

describe('Z80 basic operations', () => {
  it('should load immediate into A (LD A,n)', () => {
    const mem = new Memory();
    // place instruction at 0x0000: LD A,0x42 ; HALT (treat unknown as NOP)
    mem.loadROM(new Uint8Array([0x3E, 0x42, 0x00]));
    const cpu = new Z80(mem);
    cpu.reset();
    cpu.PC = 0x0000;
    cpu.step(); // execute LD A,0x42
    expect(cpu.A).toBe(0x42);
  });

  it('should write and read memory', () => {
    const mem = new Memory();
    mem.write(0x4000, 0x55);
    expect(mem.read(0x4000)).toBe(0x55);
  });
});
