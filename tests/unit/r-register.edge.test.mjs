/**
 * Edge-case tests for R register behavior:
 *  - R increments only on opcode (M1) fetch, not on operand reads
 *  - R increments correctly across immediate operands and memory reads
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

function makeCPU(rom = []) {
  const mem = new Memory({ contention: false });
  if (rom.length > 0) mem.loadROM(new Uint8Array(rom));
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  return { cpu, mem };
}

describe('R register edge cases', () => {
  it('LD A,n should increment R only once (opcode fetch), and A reads immediate operand', () => {
    // 0x3E nn = LD A,n
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x3E; rom[1] = 0x42;

    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // LD A,0x42
    expect(cpu.R & 0x7F).toBe(1);
    expect(cpu.A).toBe(0x42);
  });

  it('LD A,(HL) should increment R once (opcode fetch), memory read should not affect R', () => {
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x7E; // LD A,(HL)

    const { cpu, mem } = makeCPU(rom);
    cpu._setHL(0xC000);
    mem.write(0xC000, 0x55);
    cpu.R = 0;

    cpu.step(); // LD A,(HL)
    expect(cpu.R & 0x7F).toBe(1);
    expect(cpu.A).toBe(0x55);
  });

  it('16-bit immediate operand fetch only increments R for opcode fetch', () => {
    // LD HL,nn = 0x21 nn nn
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x21; rom[1] = 0x34; rom[2] = 0x12; // HL = 0x1234

    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // LD HL,0x1234
    expect(cpu.R & 0x7F).toBe(1);
    expect(cpu._getHL()).toBe(0x1234);
  });

  it('CB-prefixed op should increment R twice: CB + opcode', () => {
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xCB; rom[1] = 0x47; // BIT 0,A

    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step();
    expect(cpu.R & 0x7F).toBe(2);
  });

  it('ED-prefixed op should increment R twice: ED + opcode', () => {
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xED; rom[1] = 0x5F; // LD A,R

    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step();
    expect(cpu.R & 0x7F).toBe(2);
  });
});
