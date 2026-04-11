import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

function makeCPU(bytes) {
  const mem = new Memory();
  for (let i = 0; i < bytes.length; i++) mem.write(0x4000 + i, bytes[i]);
  const cpu = new Z80(mem);
  cpu.reset();
  cpu.PC = 0x4000;
  return cpu;
}

describe('Z80 flag lookup tables and undocumented bits 3/5', () => {
  it('should have precomputed lookup tables of length 256', () => {
    const cpu = makeCPU([0x00]);
    expect(cpu._sz53Table).toHaveLength(256);
    expect(cpu._parityTable).toHaveLength(256);
    expect(cpu._sz53pTable).toHaveLength(256);
  });

  it('sz53Table should set S, Z, bits 5/3 correctly', () => {
    const cpu = makeCPU([0x00]);
    // Value 0x00: S=0, Z=1, bits 3/5=0
    expect(cpu._sz53Table[0x00]).toBe(0x40);
    // Value 0x80: S=1, Z=0, bits 3/5=0
    expect(cpu._sz53Table[0x80]).toBe(0x80);
    // Value 0x28: S=0, Z=0, bit5=1, bit3=1
    expect(cpu._sz53Table[0x28]).toBe(0x28);
    // Value 0xFF: S=1, Z=0, bits 3/5=0x28
    expect(cpu._sz53Table[0xFF]).toBe(0x80 | 0x28);
  });

  it('parityTable should set P flag for even parity', () => {
    const cpu = makeCPU([0x00]);
    expect(cpu._parityTable[0x00]).toBe(0x04); // 0 one-bits = even parity
    expect(cpu._parityTable[0x01]).toBe(0x00); // 1 one-bit = odd parity
    expect(cpu._parityTable[0x03]).toBe(0x04); // 2 one-bits = even parity
    expect(cpu._parityTable[0xFF]).toBe(0x04); // 8 one-bits = even parity
  });

  it('XOR should set undocumented bits 3/5 from result', () => {
    // XOR B (0xA8)
    const cpu = makeCPU([0xA8]);
    cpu.A = 0xFF;
    cpu.B = 0xD7; // 0xFF ^ 0xD7 = 0x28 (bits 3 and 5 set)
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
    expect(cpu.F & 0x01).toBe(0);    // C=0
    expect(cpu.F & 0x02).toBe(0);    // N=0
    expect(cpu.F & 0x10).toBe(0);    // H=0
  });

  it('AND should set H=1 and undocumented bits 3/5', () => {
    // AND B (0xA0)
    const cpu = makeCPU([0xA0]);
    cpu.A = 0x3F;
    cpu.B = 0x28; // 0x3F & 0x28 = 0x28
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x10).toBe(0x10); // H=1 for AND
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
    expect(cpu.F & 0x01).toBe(0);    // C=0
    expect(cpu.F & 0x02).toBe(0);    // N=0
  });

  it('OR should set undocumented bits 3/5 and H=0', () => {
    // OR B (0xB0)
    const cpu = makeCPU([0xB0]);
    cpu.A = 0x08;
    cpu.B = 0x20; // 0x08 | 0x20 = 0x28
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x10).toBe(0);    // H=0 for OR
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
  });

  it('XOR A,A should give zero with correct flags', () => {
    // XOR A (0xAF)
    const cpu = makeCPU([0xAF]);
    cpu.A = 0x42;
    cpu.step();
    expect(cpu.A).toBe(0x00);
    expect(cpu.F & 0x40).toBe(0x40); // Z=1
    expect(cpu.F & 0x04).toBe(0x04); // P/V=1 (even parity)
    expect(cpu.F & 0x80).toBe(0);    // S=0
    expect(cpu.F & 0x01).toBe(0);    // C=0
    expect(cpu.F & 0x02).toBe(0);    // N=0
    expect(cpu.F & 0x10).toBe(0);    // H=0
  });

  it('AND n (0xE6) should use lookup table', () => {
    // AND n
    const cpu = makeCPU([0xE6, 0x28]);
    cpu.A = 0xFF;
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
    expect(cpu.F & 0x10).toBe(0x10); // H=1
  });

  it('OR n (0xF6) should use lookup table', () => {
    // OR n
    const cpu = makeCPU([0xF6, 0x28]);
    cpu.A = 0x00;
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
    expect(cpu.F & 0x10).toBe(0);    // H=0 for OR
  });

  it('XOR n (0xEE) should use lookup table', () => {
    // XOR n
    const cpu = makeCPU([0xEE, 0x28]);
    cpu.A = 0x00;
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
  });

  it('IN r,(C) should use lookup table via _setInFlags', () => {
    const mem = new Memory();
    // ED 78 = IN A,(C)
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0x78);
    const cpu = new Z80(mem);
    cpu.reset();
    cpu.PC = 0x4000;
    cpu.B = 0x00;
    cpu.C = 0xFE;
    cpu.F = 0x01; // carry set
    // Mock io
    cpu.io = { read: () => 0x28 };
    cpu.step();
    expect(cpu.A).toBe(0x28);
    expect(cpu.F & 0x08).toBe(0x08); // bit 3
    expect(cpu.F & 0x20).toBe(0x20); // bit 5
    expect(cpu.F & 0x01).toBe(0x01); // carry preserved
  });
});
