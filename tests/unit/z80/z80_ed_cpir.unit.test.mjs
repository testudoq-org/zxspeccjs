import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 ED CPIR repeat behavior', () => {
  it('CPIR repeats until a match is found and preserves C', () => {
    const mem = new Memory();

    // Place CPIR (ED B1) at 0x4000
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB1);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    // Setup: match occurs on third element
    cpu.A = 0x42;
    cpu.F = 0x01; // set C flag so we can check it is preserved
    cpu._setHL(0x5000);
    cpu._setBC(0x0003);
    mem.write(0x5000, 0x00);
    mem.write(0x5001, 0x00);
    mem.write(0x5002, 0x42); // match here

    // Run until Z (match) or safety limit
    let sawZ = false;
    for (let i = 0; i < 10; i++) {
      cpu.step();
      if ((cpu.F & 0x40) !== 0) { sawZ = true; break; }
    }

    expect(sawZ).toBeTruthy();
    expect(cpu._getHL()).toBe(0x5003); // HL incremented past matched byte
    expect(cpu._getBC()).toBe(0x0000); // BC decremented to 0
    expect((cpu.F & 0x01) !== 0).toBeTruthy(); // C preserved
    expect((cpu.F & 0x02) !== 0).toBeTruthy(); // N set (compare)
    expect(cpu.PC).toBe(0x4002); // instruction finished and PC advanced
  });

  it('CPIR stops when BC reaches zero with no match (Z cleared)', () => {
    const mem = new Memory();

    // Place CPIR (ED B1) at 0x4000
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB1);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0x99;
    cpu.F = 0x00; // C clear initially
    cpu._setHL(0x6000);
    cpu._setBC(0x0002);
    mem.write(0x6000, 0x01);
    mem.write(0x6001, 0x02);

    // Run until BC==0 or safety limit
    for (let i = 0; i < 10; i++) {
      cpu.step();
      if (cpu._getBC() === 0) break;
    }

    expect(cpu._getBC()).toBe(0x0000);
    expect((cpu.F & 0x40)).toBe(0); // Z cleared (no match)
    expect(cpu._getHL()).toBe(0x6002); // HL advanced past range
    expect(cpu.PC).toBe(0x4002);
    expect((cpu.F & 0x02) !== 0).toBeTruthy(); // N set (compare)
  });
});
