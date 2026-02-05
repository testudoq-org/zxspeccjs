import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 ED CPDR repeat behavior', () => {
  it('CPDR repeats until a match is found (reverse) and preserves C', () => {
    const mem = new Memory();

    // Place CPDR (ED B9) at 0x4000
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB9);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    // Setup: A matches at earlier location when scanning backwards
    cpu.A = 0x7E;
    cpu.F = 0x01; // C set to check preservation
    // start HL at 0x5002 and BC counts 3 bytes: addresses 0x5002,0x5001,0x5000
    cpu._setHL(0x5002);
    cpu._setBC(0x0003);
    mem.write(0x5002, 0x00);
    mem.write(0x5001, 0x7E); // match here
    mem.write(0x5000, 0x00);

    // Run until match observed
    let sawZ = false;
    for (let i = 0; i < 10; i++) {
      cpu.step();
      if ((cpu.F & 0x40) !== 0) { sawZ = true; break; }
    }

    expect(sawZ).toBeTruthy();
    expect(cpu._getHL()).toBe(0x5000); // HL decremented past matched byte
    // Implementation decrements BC once per scanned byte; when match found at second element, BC will be 1
    expect(cpu._getBC()).toBe(0x0001); // BC decremented appropriately
    expect((cpu.F & 0x01) !== 0).toBeTruthy(); // C preserved
    expect((cpu.F & 0x02) !== 0).toBeTruthy(); // N set (compare)
    expect(cpu.PC).toBe(0x4002); // finished
  });

  it('CPDR stops when BC reaches zero with no match (Z cleared, reverse)', () => {
    const mem = new Memory();

    // Place CPDR (ED B9) at 0x4000
    mem.write(0x4000, 0xED);
    mem.write(0x4001, 0xB9);

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.A = 0xAA;
    cpu.F = 0x00;
    cpu._setHL(0x6001);
    cpu._setBC(0x0002);
    // Memory at 0x6001 and 0x6000 do not match A
    mem.write(0x6001, 0x01);
    mem.write(0x6000, 0x02);

    for (let i = 0; i < 10; i++) {
      cpu.step();
      if (cpu._getBC() === 0) break;
    }

    expect(cpu._getBC()).toBe(0x0000);
    expect((cpu.F & 0x40)).toBe(0); // Z cleared (no match)
    expect(cpu._getHL()).toBe(0x5FFF); // HL decremented past range (from 0x6001 two steps)
    expect(cpu.PC).toBe(0x4002);
    expect((cpu.F & 0x02) !== 0).toBeTruthy(); // N set
  });
});
