import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

const bitsToTest = [0, 3, 7];
const indexedCases = [
  { prefix: 0xDD, reg: 'IX', base: 0x6000, disp: 0 },
  { prefix: 0xFD, reg: 'IY', base: 0x5000, disp: 1 },
];

describe('Z80 DDCB/FDCB parameterized SET/RES on (IX+d)/(IY+d)', () => {
  bitsToTest.forEach((bit) => {
    indexedCases.forEach(({ prefix, reg, base, disp }) => {
      it(`${reg}: SET bit ${bit} at displacement ${disp}`, () => {
        const mem = new Memory();
        // DD/FD CB d opcode then cbOpcode
        const cbOpcode = 0xC0 + (bit << 3) + 0x06; // SET b,(HL) uses r=6
        mem.write(0x4000, prefix);
        mem.write(0x4001, 0xCB);
        mem.write(0x4002, disp);
        mem.write(0x4003, cbOpcode);

        const cpu = new Z80(mem);
        cpu.reset(); cpu.PC = 0x4000;

        // Set index and place operand with bit clear
        if (reg === 'IX') cpu.IX = base;
        else cpu.IY = base;
        const addr = base + disp;
        mem.write(addr, 0x00); // all bits clear

        cpu.step();
        expect(mem.read(addr)).toBe(0x00 | (1 << bit));
      });

      it(`${reg}: RES bit ${bit} at displacement ${disp}`, () => {
        const mem = new Memory();
        const cbOpcode = 0x80 + (bit << 3) + 0x06; // RES b,(HL)
        mem.write(0x4000, prefix);
        mem.write(0x4001, 0xCB);
        mem.write(0x4002, disp);
        mem.write(0x4003, cbOpcode);

        const cpu = new Z80(mem);
        cpu.reset(); cpu.PC = 0x4000;

        if (reg === 'IX') cpu.IX = base;
        else cpu.IY = base;
        const addr = base + disp;
        mem.write(addr, 0xFF); // all bits set

        cpu.step();
        expect(mem.read(addr)).toBe(0xFF & ~(1 << bit));
      });
    });
  });
});
