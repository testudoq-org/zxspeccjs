import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

describe('Z80 CB (HL) full bit-range', () => {
  it('BIT b,(HL) sets Z appropriately for bits 0..7', () => {
    for (let bit = 0; bit < 8; bit++) {
      const mem = new Memory();
      const cpu = new Z80(mem);
      const addr = 0x5000;
      cpu.H = 0x50; cpu.L = 0x00;

      // bit set
      mem.write(addr, 1 << bit);
      const opcode = 0x40 + (bit << 3) + 6; // BIT b,(HL)
      mem.write(0x4000, 0xCB);
      mem.write(0x4001, opcode);
      cpu.PC = 0x4000;
      cpu.F = 0;
      cpu.step();
      expect((cpu.F & 0x40)).toBe(0); // Z cleared when bit set

      // bit clear
      const mem2 = new Memory();
      const cpu2 = new Z80(mem2);
      cpu2.H = 0x50; cpu2.L = 0x00;
      mem2.write(addr, 0x00);
      mem2.write(0x4000, 0xCB);
      mem2.write(0x4001, opcode);
      cpu2.PC = 0x4000;
      cpu2.F = 0;
      cpu2.step();
      expect((cpu2.F & 0x40)).toBe(0x40); // Z set when bit clear
    }
  });

  it('RES/SET b,(HL) clear and set bits in memory respectively', () => {
    for (let bit = 0; bit < 8; bit++) {
      const addr = 0x5100;

      // RES b,(HL)
      const memR = new Memory();
      const cpuR = new Z80(memR);
      cpuR.H = 0x51; cpuR.L = 0x00;
      memR.write(addr, 0xFF);
      const resOpcode = 0x80 + (bit << 3) + 6;
      memR.write(0x4000, 0xCB);
      memR.write(0x4001, resOpcode);
      cpuR.PC = 0x4000;
      cpuR.step();
      expect((memR.read(addr) & (1 << bit))).toBe(0);

      // SET b,(HL)
      const memS = new Memory();
      const cpuS = new Z80(memS);
      cpuS.H = 0x51; cpuS.L = 0x00;
      memS.write(addr, 0x00);
      const setOpcode = 0xC0 + (bit << 3) + 6;
      memS.write(0x4000, 0xCB);
      memS.write(0x4001, setOpcode);
      cpuS.PC = 0x4000;
      cpuS.step();
      expect((memS.read(addr) & (1 << bit))).toBe(1 << bit);
    }
  });
});