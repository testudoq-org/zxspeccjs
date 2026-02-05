import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 ED block operations (LDI / LDIR)', () => {
  it('LDI copies single transfers, updates HL/DE/BC and PV/H/N/C behavior across two LDI ops', () => {
    const mem = new Memory();
    // Two LDI ops in sequence: ED A0 ; ED A0 ; HALT (place opcodes in RAM)
    mem.write(0x4000, 0xED); mem.write(0x4001, 0xA0);
    mem.write(0x4002, 0xED); mem.write(0x4003, 0xA0);
    mem.write(0x4004, 0x00);
    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.H = 0x50; cpu.L = 0x00; // HL = 0x5000
    cpu.D = 0x60; cpu.E = 0x00; // DE = 0x6000
    cpu.B = 0x00; cpu.C = 0x02; // BC = 2
    mem.write(0x5000, 0x55);
    mem.write(0x5001, 0x66);

    // set carry and a non-zero flag pattern to ensure preserved/cleared states
    cpu.F = 0x01;

    cpu.step(); // first LDI
    expect(mem.read(0x6000)).toBe(0x55);
    expect(((cpu.B << 8) | cpu.C)).toBe(0x0001);
    expect((cpu.F & 0x10)).toBe(0); // H cleared
    expect((cpu.F & 0x02)).toBe(0); // N cleared
    // PV set because BC != 0
    expect((cpu.F & 0x04) !== 0).toBeTruthy();
    expect((cpu.F & 0x01) !== 0).toBeTruthy(); // carry preserved

    cpu.step(); // second LDI
    expect(mem.read(0x6001)).toBe(0x66);
    expect(((cpu.B << 8) | cpu.C)).toBe(0x0000);
    // PV cleared because BC == 0
    expect((cpu.F & 0x04)).toBe(0);
  });

  it('LDIR repeats until BC==0 and copies multiple bytes (repeat behaviour)', () => {
    const mem = new Memory();
    // Single LDIR instruction: ED B0 (place opcode in RAM)
    mem.write(0x4000, 0xED); mem.write(0x4001, 0xB0); mem.write(0x4002, 0x00);
    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.H = 0x51; cpu.L = 0x00; // HL = 0x5100
    cpu.D = 0x61; cpu.E = 0x00; // DE = 0x6100
    cpu.B = 0x00; cpu.C = 0x02; // BC = 2
    mem.write(0x5100, 0x99);
    mem.write(0x5101, 0xAA);

    cpu.F = 0x00; // clear flags
    // Depending on internal implementation the repeat may require multiple steps - execute until BC reaches 0
    cpu.step();
    cpu.step();

    expect(mem.read(0x6100)).toBe(0x99);
    expect(mem.read(0x6101)).toBe(0xAA);
    expect(((cpu.B << 8) | cpu.C)).toBe(0x0000);
    expect((cpu.F & 0x04)).toBe(0); // PV cleared when BC==0
  });
});
