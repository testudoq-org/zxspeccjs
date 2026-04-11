import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

/**
 * Helper: create a CPU with a single instruction at 0x4000.
 * Bytes should be the opcode(s) to test.
 */
function makeCPU(bytes) {
  const mem = new Memory();
  for (let i = 0; i < bytes.length; i++) mem.write(0x4000 + i, bytes[i]);
  const cpu = new Z80(mem);
  cpu.reset();
  cpu.PC = 0x4000;
  return cpu;
}

describe('Z80 DAA instruction (0x27)', () => {
  it('should adjust after BCD addition: 0x15 + 0x27 = 0x42', () => {
    // ADD A,0x27 (0xC6 0x27), then DAA (0x27)
    const mem = new Memory();
    mem.write(0x4000, 0xC6); // ADD A,n
    mem.write(0x4001, 0x27);
    mem.write(0x4002, 0x27); // DAA
    const cpu = new Z80(mem);
    cpu.reset();
    cpu.PC = 0x4000;
    cpu.A = 0x15;
    cpu.F = 0x00;
    cpu.step(); // ADD A,0x27 => A = 0x3C
    expect(cpu.A).toBe(0x3C);
    cpu.step(); // DAA => A = 0x42
    expect(cpu.A).toBe(0x42);
    expect(cpu.F & 0x01).toBe(0); // no carry
  });

  it('should set carry when BCD result > 99', () => {
    // ADD A,0x50 when A=0x60 => raw 0xB0, DAA => 0x10 + carry
    const mem = new Memory();
    mem.write(0x4000, 0xC6); // ADD A,n
    mem.write(0x4001, 0x50);
    mem.write(0x4002, 0x27); // DAA
    const cpu = new Z80(mem);
    cpu.reset();
    cpu.PC = 0x4000;
    cpu.A = 0x60;
    cpu.F = 0x00;
    cpu.step(); // ADD A,0x50 => A = 0xB0
    cpu.step(); // DAA => A = 0x10, carry = 1
    expect(cpu.A).toBe(0x10);
    expect(cpu.F & 0x01).toBe(1); // carry set
  });

  it('should handle DAA after subtraction (N=1)', () => {
    // SUB 0x01 when A=0x10 => A=0x0F, N=1; DAA => A=0x09
    const mem = new Memory();
    mem.write(0x4000, 0xD6); // SUB n
    mem.write(0x4001, 0x01);
    mem.write(0x4002, 0x27); // DAA
    const cpu = new Z80(mem);
    cpu.reset();
    cpu.PC = 0x4000;
    cpu.A = 0x10;
    cpu.F = 0x00;
    cpu.step(); // SUB 0x01 => A=0x0F, N=1
    expect(cpu.A).toBe(0x0F);
    expect(cpu.F & 0x02).toBe(0x02); // N set
    cpu.step(); // DAA => A=0x09
    expect(cpu.A).toBe(0x09);
    expect(cpu.F & 0x02).toBe(0x02); // N preserved
  });

  it('should handle zero result with correct parity', () => {
    const cpu = makeCPU([0x27]); // DAA
    cpu.A = 0x00;
    cpu.F = 0x00; // N=0, C=0, H=0
    cpu.step();
    expect(cpu.A).toBe(0x00);
    expect(cpu.F & 0x40).toBe(0x40); // Z set
    expect(cpu.F & 0x04).toBe(0x04); // P/V set (even parity)
  });

  it('should adjust low nibble when half-carry is set', () => {
    const cpu = makeCPU([0x27]); // DAA
    cpu.A = 0x0A; // low nibble > 9
    cpu.F = 0x00;
    cpu.step();
    expect(cpu.A).toBe(0x10);
    expect(cpu.F & 0x10).toBe(0x10); // H set (low nibble > 9)
  });

  it('should account for carry flag on entry', () => {
    const cpu = makeCPU([0x27]); // DAA
    cpu.A = 0x00;
    cpu.F = 0x01; // C=1 on entry
    cpu.step();
    expect(cpu.A).toBe(0x60);
    expect(cpu.F & 0x01).toBe(0x01); // carry still set
  });

  it('should set undocumented bits 3/5 from result', () => {
    const cpu = makeCPU([0x27]); // DAA
    cpu.A = 0x28; // bits 3=1, 5=1
    cpu.F = 0x00;
    cpu.step();
    expect(cpu.A).toBe(0x28); // no adjustment needed (valid BCD)
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
  });

  it('should take 4 T-states', () => {
    const cpu = makeCPU([0x27]);
    cpu.A = 0x00;
    cpu.F = 0x00;
    const before = cpu.tstates;
    cpu.step();
    expect(cpu.tstates - before).toBe(4);
  });
});
