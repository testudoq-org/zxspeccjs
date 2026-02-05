import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 DDCB/FDCB indexed CB sequences (representative)', () => {
  it('BIT 7,(IX+0) sets Z when bit clear and clears Z when set', () => {
    const mem = new Memory();
    const cpu = new Z80(mem);
    const pc = 0x4000;
    // Sequence: DD CB d cbOpcode -> BIT 7,(IX+d) is cbOpcode 0x7E
    mem.write(pc, 0xDD); mem.write(pc + 1, 0xCB); mem.write(pc + 2, 0x00); mem.write(pc + 3, 0x7E);
    cpu.reset(); cpu.PC = pc;
    cpu.IX = 0x5000;
    mem.write(0x5000, 0x00); // bit 7 clear
    cpu.F = 0x00;
    cpu.step();
    expect((cpu.F & 0x40)).toBe(0x40); // Z set when bit clear

    // Now bit set case
    const mem2 = new Memory(); const cpu2 = new Z80(mem2);
    mem2.write(pc, 0xDD); mem2.write(pc + 1, 0xCB); mem2.write(pc + 2, 0x00); mem2.write(pc + 3, 0x7E);
    cpu2.reset(); cpu2.PC = pc; cpu2.IX = 0x5000;
    mem2.write(0x5000, 0x80);
    cpu2.F = 0x00;
    cpu2.step();
    expect((cpu2.F & 0x40)).toBe(0); // Z cleared when bit set
  });
});
