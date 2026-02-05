import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

describe('Z80 CB-prefixed operations (smoke tests)', () => {
  it('RLC B rotates and sets carry', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xCB);
    mem.write(0x4001, 0x00); // RLC B

    const cpu = new Z80(mem);
    cpu.PC = 0x4000;
    cpu.B = 0x80; // bit 7 set
    cpu.F = 0x00;

    cpu.step();

    expect(cpu.B).toBe(0x01); // rotated out 0x80 -> 0x01
    expect((cpu.F & 0x01)).toBe(1); // carry flag set
    expect((cpu.F & 0x40)).toBe(0); // Z should be clear (result non-zero)
  });

  it('RLC (HL) rotates memory location and sets flags', () => {
    const mem = new Memory();
    mem.write(0x4100, 0xCB);
    mem.write(0x4101, 0x06); // RLC (HL)
    mem.write(0x5000, 0x80);

    const cpu = new Z80(mem);
    cpu.PC = 0x4100;
    cpu.H = 0x50; cpu.L = 0x00;
    cpu.F = 0x00;

    cpu.step();

    expect(mem.read(0x5000)).toBe(0x01);
    expect((cpu.F & 0x01)).toBe(1); // carry
  });
});