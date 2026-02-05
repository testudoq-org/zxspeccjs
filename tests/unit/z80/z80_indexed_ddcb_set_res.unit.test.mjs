import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 DDCB/FDCB RES/SET on (IX+d)/(IY+d)', () => {
  it('SET bit 3 on (IX+0) sets the bit in memory', () => {
    const mem = new Memory();

    // Instruction at 0x4000: DD CB 00 DE  => SET 3,(IX+0)
    mem.write(0x4000, 0xDD);
    mem.write(0x4001, 0xCB);
    mem.write(0x4002, 0x00);
    mem.write(0x4003, 0xDE);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    // Place operand at IX+0 (use RAM page)
    cpu.IX = 0x6000;
    mem.write(0x6000, 0xF7); // bit 3 clear (0b11110111)

    cpu.step(); // execute SET 3,(IX+0)

    expect(mem.read(0x6000)).toBe(0xFF); // bit3 set -> 0xF7 | 0x08 == 0xFF
  });

  it('RES bit 7 on (IY+1) clears the bit in memory', () => {
    const mem = new Memory();

    // Instruction at 0x4000: FD CB 01 BE  => RES 7,(IY+1)
    mem.write(0x4000, 0xFD);
    mem.write(0x4001, 0xCB);
    mem.write(0x4002, 0x01);
    mem.write(0x4003, 0xBE);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    // Place operand at IY+1 (use RAM page)
    cpu.IY = 0x5000;
    mem.write(0x5001, 0xFF); // bit7 set

    cpu.step(); // execute RES 7,(IY+1)

    expect(mem.read(0x5001)).toBe(0x7F); // bit7 cleared -> 0xFF & ~0x80 == 0x7F
  });
});
