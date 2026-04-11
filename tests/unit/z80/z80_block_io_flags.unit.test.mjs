import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

/**
 * Helper: create a CPU with given bytes at PC=0x4000.
 */
function makeCPU(bytes) {
  const mem = new Memory();
  for (let i = 0; i < bytes.length; i++) mem.write(0x4000 + i, bytes[i]);
  const cpu = new Z80(mem);
  cpu.reset();
  cpu.PC = 0x4000;
  return cpu;
}

describe('Z80 Block I/O flag computation (Sean Young)', () => {
  describe('INI (ED A2)', () => {
    it('should set Z when B decrements to 0', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x01;
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x00 };
      cpu.step();
      expect(cpu.B).toBe(0x00);
      expect(cpu.F & 0x40).toBe(0x40); // Z set
    });

    it('should clear Z when B does not decrement to 0', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x05;
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x00 };
      cpu.step();
      expect(cpu.B).toBe(0x04);
      expect(cpu.F & 0x40).toBe(0); // Z clear
    });

    it('should set N when input byte has bit 7 set', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x80 };
      cpu.step();
      expect(cpu.F & 0x02).toBe(0x02); // N set
    });

    it('should clear N when input byte has bit 7 clear', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x7F };
      cpu.step();
      expect(cpu.F & 0x02).toBe(0); // N clear
    });

    it('should write input value at (HL) and increment HL', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x42 };
      cpu.step();
      expect(cpu.mem.read(0x5000)).toBe(0x42);
      expect(cpu.H).toBe(0x50);
      expect(cpu.L).toBe(0x01);
    });

    it('should take 16 T-states', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x01;
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x00 };
      const cycles = cpu.step();
      expect(cycles).toBe(16);
    });

    it('should set S flag from B (undocumented bits from B via sz53Table)', () => {
      const cpu = makeCPU([0xED, 0xA2]);
      cpu.B = 0x81; // B-1=0x80, S flag set
      cpu.C = 0xFE;
      cpu.H = 0x40;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x00 };
      cpu.step();
      expect(cpu.B).toBe(0x80);
      expect(cpu.F & 0x80).toBe(0x80); // S set (B=0x80)
    });
  });

  describe('IND (ED AA)', () => {
    it('should decrement HL and decrement B', () => {
      const cpu = makeCPU([0xED, 0xAA]);
      cpu.B = 0x03;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x05;
      cpu.io = { read: () => 0x55 };
      cpu.step();
      expect(cpu.B).toBe(0x02);
      expect(cpu.H).toBe(0x50);
      expect(cpu.L).toBe(0x04);
      expect(cpu.mem.read(0x5005)).toBe(0x55);
    });
  });

  describe('INIR (ED B2)', () => {
    it('should repeat until B=0 and take 21 T-states per iteration (except last 16)', () => {
      const cpu = makeCPU([0xED, 0xB2]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.io = { read: () => 0x42 };
      // First iteration: B=2 ->1, repeats (21 T-states)
      const c1 = cpu.step();
      expect(c1).toBe(21);
      expect(cpu.B).toBe(0x01);
      expect(cpu.PC).toBe(0x4000); // loops back
      // Second iteration: B=1 -> 0, done (16 T-states)
      const c2 = cpu.step();
      expect(c2).toBe(16);
      expect(cpu.B).toBe(0x00);
      expect(cpu.PC).toBe(0x4002); // advances past opcode
    });
  });

  describe('OUTI (ED A3)', () => {
    it('should output value at (HL), decrement B, and increment HL', () => {
      const cpu = makeCPU([0xED, 0xA3]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      // Write a value at (HL) for the CPU to output
      cpu.mem.write(0x5000, 0xAB);
      let outputVal = 0;
      let outputPort = 0;
      cpu.io = {
        read: () => 0xFF,
        write: (port, val) => { outputPort = port; outputVal = val; }
      };
      cpu.step();
      expect(outputVal).toBe(0xAB);
      // Port = BC after B is decremented: B=1, C=0xFE => port=0x01FE
      expect(outputPort).toBe(0x01FE);
      expect(cpu.B).toBe(0x01);
      expect(cpu.L).toBe(0x01);
    });

    it('should set Z when B decrements to 0', () => {
      const cpu = makeCPU([0xED, 0xA3]);
      cpu.B = 0x01;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.mem.write(0x5000, 0x00);
      cpu.io = { read: () => 0xFF, write: () => {} };
      cpu.step();
      expect(cpu.B).toBe(0x00);
      expect(cpu.F & 0x40).toBe(0x40); // Z set
    });

    it('should set N from bit 7 of output byte', () => {
      const cpu = makeCPU([0xED, 0xA3]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.mem.write(0x5000, 0x80);
      cpu.io = { read: () => 0xFF, write: () => {} };
      cpu.step();
      expect(cpu.F & 0x02).toBe(0x02); // N set
    });

    it('should take 16 T-states', () => {
      const cpu = makeCPU([0xED, 0xA3]);
      cpu.B = 0x01;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.mem.write(0x5000, 0x00);
      cpu.io = { read: () => 0xFF, write: () => {} };
      expect(cpu.step()).toBe(16);
    });
  });

  describe('OUTD (ED AB)', () => {
    it('should decrement HL and decrement B', () => {
      const cpu = makeCPU([0xED, 0xAB]);
      cpu.B = 0x03;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x05;
      cpu.mem.write(0x5005, 0x77);
      let outputVal = 0;
      cpu.io = { read: () => 0xFF, write: (_p, v) => { outputVal = v; } };
      cpu.step();
      expect(outputVal).toBe(0x77);
      expect(cpu.B).toBe(0x02);
      expect(cpu.L).toBe(0x04);
    });
  });

  describe('OTIR (ED B3)', () => {
    it('should repeat until B=0', () => {
      const cpu = makeCPU([0xED, 0xB3]);
      cpu.B = 0x02;
      cpu.C = 0xFE;
      cpu.H = 0x50;
      cpu.L = 0x00;
      cpu.mem.write(0x5000, 0x11);
      cpu.mem.write(0x5001, 0x22);
      const outputs = [];
      cpu.io = { read: () => 0xFF, write: (_p, v) => { outputs.push(v); } };
      // First iteration: B=2->1, repeats
      const c1 = cpu.step();
      expect(c1).toBe(21);
      expect(cpu.B).toBe(0x01);
      // Second iteration: B=1->0, done
      const c2 = cpu.step();
      expect(c2).toBe(16);
      expect(cpu.B).toBe(0x00);
      expect(outputs).toEqual([0x11, 0x22]);
    });
  });
});
