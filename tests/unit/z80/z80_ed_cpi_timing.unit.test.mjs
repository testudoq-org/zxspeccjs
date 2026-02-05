import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 ED CPI/CPIR/CPD/CPDR timing (tstates)', () => {
  it('CPI returns 16 t-states for single compare', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xA1); // CPI

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0x42;
    cpu._setHL(0x5000);
    cpu._setBC(0x0001);
    mem.write(0x5000, 0x42); // match

    const before = cpu.tstates;
    const cycles = cpu.step();

    expect(cycles).toBe(16);
    expect(cpu.tstates - before).toBe(cycles);
    expect((cpu.F & 0x40) !== 0).toBeTruthy(); // Z set
  });

  it('CPIR uses 21 t-states when repeating (then 16 when matches)', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB1); // CPIR

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0x42;
    cpu._setHL(0x5000);
    cpu._setBC(0x0003);
    mem.write(0x5000, 0x00);
    mem.write(0x5001, 0x00);
    mem.write(0x5002, 0x42); // match at third

    const before = cpu.tstates;

    const c1 = cpu.step(); // should repeat -> 21
    expect(c1).toBe(21);
    expect(cpu.tstates - before).toBe(c1);

    const c2 = cpu.step(); // should repeat -> 21
    expect(c2).toBe(21);

    const c3 = cpu.step(); // should match -> 16
    expect(c3).toBe(16);

    expect(cpu._getBC()).toBe(0x0000);
    expect((cpu.F & 0x40) !== 0).toBeTruthy(); // Z set
  });

  it('CPD returns 16 t-states for single compare (decrement)', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xA9); // CPD

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0x10;
    cpu._setHL(0x6000);
    cpu._setBC(0x0001);
    mem.write(0x6000, 0x10); // match

    const before = cpu.tstates;
    const cycles = cpu.step();

    expect(cycles).toBe(16);
    expect(cpu.tstates - before).toBe(cycles);
    expect((cpu.F & 0x40) !== 0).toBeTruthy(); // Z set
  });

  it('CPDR uses 21 t-states when repeating (reverse) then 16 when match', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB9); // CPDR

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0x7E;
    cpu._setHL(0x5002);
    cpu._setBC(0x0003);
    mem.write(0x5002, 0x00);
    mem.write(0x5001, 0x7E); // match at second
    mem.write(0x5000, 0x00);

    const c1 = cpu.step(); // should repeat -> 21
    expect(c1).toBe(21);

    const c2 = cpu.step(); // should find match -> 16
    expect(c2).toBe(16);

    expect((cpu.F & 0x40) !== 0).toBeTruthy(); // Z set
  });
});
