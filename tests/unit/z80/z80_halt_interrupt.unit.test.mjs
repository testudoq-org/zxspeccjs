import { describe, it, expect } from 'vitest';
import { Memory } from '../../../src/memory.mjs';
import { Z80 } from '../../../src/z80.mjs';

describe('Z80 HALT and interrupt timing/semantics', () => {
  it('HALT burns 4 t-states per idle step and PC remains on HALT', () => {
    const mem = new Memory();
    mem.write(0x4000, 0x76); // HALT

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    const before = cpu.tstates;
    const c1 = cpu.step();
    expect(c1).toBe(4);
    expect(cpu.halted).toBeTruthy();
    expect(cpu.PC).toBe(0x4000);
    expect(cpu.tstates - before).toBe(4);

    const c2 = cpu.step();
    expect(c2).toBe(4);
    expect(cpu.halted).toBeTruthy();
    expect(cpu.tstates - before).toBe(8);
  });

  it('Pending interrupt does not exit HALT when IFF1 is false', () => {
    const mem = new Memory();
    mem.write(0x4000, 0x76); // HALT

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000;

    cpu.halted = true;
    cpu.IFF1 = false;

    cpu.requestInterrupt(); // intRequested = true

    const c = cpu.step();
    expect(c).toBe(4);
    expect(cpu.halted).toBeTruthy();
    // interrupt remains pending until enabled
    expect(cpu.intRequested).toBeTruthy();
  });

  it('Interrupt while HALT and IFF1 true exits HALT and services interrupt (13 t-states)', () => {
    const mem = new Memory();
    mem.write(0x4000, 0x76); // HALT

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000; cpu.SP = 0xFFFF;

    cpu.halted = true;
    cpu.IFF1 = true; cpu.IFF2 = true;
    cpu.requestInterrupt();

    const before = cpu.tstates;
    const c = cpu.step();

    expect(c).toBe(13);
    expect(cpu.tstates - before).toBe(13);
    expect(cpu.halted).toBeFalsy();
    expect(cpu.IFF1).toBeFalsy();
    expect(cpu.IFF2).toBeFalsy();
    expect(cpu.PC).toBe(0x0038);

    // check pushWord wrote return PC (0x4000) to stack
    expect(cpu.SP).toBe(0xFFFD);
    expect(mem.read(0xFFFD)).toBe(0x00); // low
    expect(mem.read(0xFFFE)).toBe(0x40); // high
  });

  it('EI enables interrupts immediately and a pending interrupt is serviced on next step', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xFB); // EI

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000; cpu.SP = 0xFFFF;

    cpu.IFF1 = false; cpu.IFF2 = false;
    cpu.requestInterrupt(); // interrupt pending before EI

    const c1 = cpu.step(); // execute EI
    expect(c1).toBe(4);
    expect(cpu.IFF1).toBeTruthy();
    expect(cpu.IFF2).toBeTruthy();

    const c2 = cpu.step(); // should now service interrupt
    expect(c2).toBe(13);
    expect(cpu.PC).toBe(0x0038);
    expect(cpu.intRequested).toBeFalsy();
  });

  it('DI disables interrupts immediately and prevents a later interrupt from being serviced', () => {
    const mem = new Memory();
    mem.write(0x4000, 0xF3); // DI
    mem.write(0x4001, 0x00); // NOP (so next step executes NOP if interrupt not serviced)

    const cpu = new Z80(mem);
    cpu.reset(); cpu.PC = 0x4000; cpu.SP = 0xFFFF;

    cpu.IFF1 = true; cpu.IFF2 = true;

    const c1 = cpu.step(); // execute DI
    expect(c1).toBe(4);
    expect(cpu.IFF1).toBeFalsy();
    expect(cpu.IFF2).toBeFalsy();

    // now an interrupt arrives
    cpu.requestInterrupt();

    const c2 = cpu.step(); // should execute NOP (4) and NOT service interrupt because IFF1 is false
    expect(c2).toBe(4);
    expect(cpu.intRequested).toBeTruthy();
  });

  it('ED IM instructions set IM mode and consume 8 t-states', () => {
    const mem = new Memory();

    // IM 0
    mem.write(0x4000, 0xED); mem.write(0x4001, 0x46);
    const cpu0 = new Z80(mem); cpu0.reset(); cpu0.PC = 0x4000;
    const c0 = cpu0.step(); expect(c0).toBe(8); expect(cpu0.IM).toBe(0);

    // IM 1
    mem.write(0x4000, 0xED); mem.write(0x4001, 0x56);
    const cpu1 = new Z80(mem); cpu1.reset(); cpu1.PC = 0x4000;
    const c1 = cpu1.step(); expect(c1).toBe(8); expect(cpu1.IM).toBe(1);

    // IM 2
    mem.write(0x4000, 0xED); mem.write(0x4001, 0x5E);
    const cpu2 = new Z80(mem); cpu2.reset(); cpu2.PC = 0x4000;
    const c2 = cpu2.step(); expect(c2).toBe(8); expect(cpu2.IM).toBe(2);
  });
});
