/**
 * Tests for R register behavior across interrupt acceptance & handling
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

describe('R register and interrupts', () => {
  it('after IM1 interrupt acceptance, next opcode fetch increments R once', () => {
    // Put RST 38 handler at 0x0038 that does NOP
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0x0038] = 0x00; // NOP

    const { cpu } = makeCPU(rom);
    cpu.R = 0;
    cpu.IFF1 = true;
    cpu.intRequested = true;
    cpu.IM = 1;

    // Accept the interrupt (consumes cycles but should not itself increment R)
    cpu.step();
    // Now execute the RST 38 handler (opcode fetch) which should increment R by 1
    cpu.step();

    expect(cpu.R & 0x7F).toBe(1);
  });

  it('IM2 interrupt vector load does not increment R until handler opcode fetch', () => {
    // Setup vector table at I<<8 | 0xFF pointing to 0x4000
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0x4000] = 0x00; // handler NOP

    const { cpu, mem } = makeCPU(rom);
    cpu.PC = 0x0000;
    cpu.SP = 0xFF00;
    cpu.I = 0x40; // vector hi byte

    // write vector L/O to 0x40FF..0x4100
    mem.write(0x40FF, 0x00);
    mem.write(0x4100, 0x40);

    cpu.R = 0;
    cpu.IFF1 = true;
    cpu.intRequested = true;
    cpu.IM = 2;

    // Accept IM2 interrupt: consume cycles (vector lookup reads memory but should not count as opcode fetch)
    cpu.step();
    // Next opcode fetch at new PC should increment R
    cpu.step();
    expect(cpu.R & 0x7F).toBe(1);
  });

  it('HALT exits on interrupt and R increments appropriately', () => {
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x76; // HALT at 0

    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // HALT (R -> 1)
    expect(cpu.R & 0x7F).toBe(1);

    cpu.IFF1 = true;
    cpu.intRequested = true;
    // Next step should process interrupt accept (exit HALT) and then next opcode fetch increments R
    cpu.step(); // accept interrupt
    cpu.step(); // execute handler at 0x0038 (NOP) -> increments R
    expect(cpu.R & 0x7F).toBeGreaterThan(1);
  });
});
