import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Helper to execute a single CB opcode at address and return cpu/memory state
function runCB(mem, cpu, opcode) {
  mem.write(0x4000, 0xCB);
  mem.write(0x4001, opcode);
  cpu.PC = 0x4000;
  cpu.step();
}

describe('Z80 CB-prefixed comprehensive checks', () => {
  it('BIT 7,r sets Z correctly across registers', () => {
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    for (let regIndex = 0; regIndex < 8; regIndex++) {
      const mem = new Memory();
      const cpu = new Z80(mem);
      // place opcode BIT 7,reg -> 0x40 + (7<<3) + regIndex = 0x78 + regIndex
      const opcode = 0x78 + regIndex;

      // Case: bit set (value contains 0x80)
      if (regIndex === 6) {
        // (HL)
        mem.write(0x5000, 0x80);
        cpu.H = 0x50; cpu.L = 0x00;
      } else {
        const regName = regs[regIndex];
        cpu[regName] = 0x80;
      }
      cpu.F = 0; // clear flags
      runCB(mem, cpu, opcode);
      expect((cpu.F & 0x40)).toBe(0); // Z cleared when bit set

      // Case: bit clear
      const mem2 = new Memory();
      const cpu2 = new Z80(mem2);
      if (regIndex === 6) {
        mem2.write(0x5000, 0x00);
        cpu2.H = 0x50; cpu2.L = 0x00;
      } else {
        const regName = regs[regIndex];
        cpu2[regName] = 0x00;
      }
      cpu2.F = 0;
      runCB(mem2, cpu2, opcode);
      expect((cpu2.F & 0x40)).toBe(0x40); // Z set when bit clear
    }
  });

  it('RES b,r clears bit and SET b,r sets bit for a representative set', () => {
    const regIndices = [0,1,2,3,4,5,7]; // B,C,D,E,H,L,A (skip (HL) for brevity)
    for (const regIndex of regIndices) {
      // RES 3,r (clear bit 3)
      const resOpcode = 0x80 + (3<<3) + regIndex; // 0x98 + regIndex
      const mem = new Memory();
      const cpu = new Z80(mem);
      const regNames = ['B','C','D','E','H','L','(HL)','A'];
      const regName = regNames[regIndex];

      cpu[regName] = 0xFF;
      cpu.PC = 0x4000;
      runCB(mem, cpu, resOpcode);
      expect(cpu[regName] === undefined ? true : (cpu[regName] & (1<<3))).toBeFalsy();

      // SET 3,r (set bit 3)
      const setOpcode = 0xC0 + (3<<3) + regIndex; // 0xD8 + regIndex
      const mem2 = new Memory();
      const cpu2 = new Z80(mem2);
      cpu2[regName] = 0x00;
      runCB(mem2, cpu2, setOpcode);
      expect(cpu2[regName] === undefined ? true : (cpu2[regName] & (1<<3))).toBeTruthy();
    }
  });
});