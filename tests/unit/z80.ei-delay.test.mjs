/* eslint-disable no-console */
/**
 * Tests for the Z80 EI delay — after EI the next instruction must execute
 * before a pending interrupt can be accepted.  This is real Z80 behaviour
 * and is critical for EI;RET / EI;HALT patterns.
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

function makeCpu(code, startAddr = 0x8000) {
  const mem = new Memory();
  // Write code into RAM (page 2, logical 0x8000)
  for (let i = 0; i < code.length; i++) {
    mem.write(startAddr + i, code[i]);
  }
  const cpu = new Z80(mem);
  cpu.PC = startAddr;
  return cpu;
}

describe('Z80 EI delay', () => {
  it('EI sets IFF1 and IFF2 immediately', () => {
    const cpu = makeCpu([0xFB]); // EI
    expect(cpu.IFF1).toBe(false);
    cpu.step(); // EI
    expect(cpu.IFF1).toBe(true);
    expect(cpu.IFF2).toBe(true);
  });

  it('pending interrupt is NOT accepted on the instruction immediately after EI', () => {
    // Code: EI ; NOP ; NOP
    const cpu = makeCpu([0xFB, 0x00, 0x00]); // EI, NOP, NOP
    cpu.IFF1 = false;
    cpu.intRequested = true; // pending interrupt

    cpu.step(); // EI — sets IFF1=true, eiDelay=1
    expect(cpu.IFF1).toBe(true);
    expect(cpu.eiDelay).toBe(1);
    // intRequested still true, but eiDelay prevents acceptance
    expect(cpu.intRequested).toBe(true);

    // Next step should execute NOP (not accept interrupt) because eiDelay > 0
    const pc_before = cpu.PC;
    cpu.step(); // NOP — eiDelay decremented to 0, instruction executes
    expect(cpu.eiDelay).toBe(0);
    // PC advanced past NOP (1 byte) — the interrupt was NOT taken
    expect(cpu.PC).toBe(pc_before + 1);
    // intRequested still pending
    expect(cpu.intRequested).toBe(true);
  });

  it('pending interrupt IS accepted on the second instruction after EI', () => {
    // Code at 0x8000: EI ; NOP ; NOP
    // ISR will jump to 0x0038 (IM1) — doesn't matter where it goes,
    // we just check that interrupt acceptance happens.
    const cpu = makeCpu([0xFB, 0x00, 0x00]);
    cpu.IFF1 = false;
    cpu.IM = 1;
    cpu.intRequested = true;
    cpu.SP = 0xFF00;

    cpu.step(); // EI
    cpu.step(); // NOP (eiDelay consumed)

    // Now the next step should accept the interrupt
    const sp_before = cpu.SP;
    cpu.step(); // interrupt accepted — pushes PC, jumps to 0x0038
    expect(cpu.intRequested).toBe(false);
    expect(cpu.PC).toBe(0x0038);
    // SP decreased by 2 (pushed return address)
    expect(cpu.SP).toBe(sp_before - 2);
  });

  it('EI;HALT: HALT executes before interrupt fires (standard game pattern)', () => {
    // Code: EI ; HALT
    const cpu = makeCpu([0xFB, 0x76]); // EI, HALT
    cpu.IFF1 = false;
    cpu.IM = 1;
    cpu.intRequested = true;
    cpu.SP = 0xFF00;

    cpu.step(); // EI — IFF1=true, eiDelay=1

    // HALT should execute next (eiDelay prevents interrupt)
    cpu.step(); // HALT — CPU enters halted state
    expect(cpu.halted).toBe(true);
    // Interrupt still pending
    expect(cpu.intRequested).toBe(true);

    // Next step: eiDelay is now 0, intRequested && IFF1 → interrupt fires
    cpu.step();
    expect(cpu.halted).toBe(false); // HALT lifted
    expect(cpu.intRequested).toBe(false);
    expect(cpu.PC).toBe(0x0038); // IM1 ISR
  });

  it('eiDelay is cleared on reset', () => {
    const cpu = makeCpu([0xFB]);
    cpu.step(); // EI
    expect(cpu.eiDelay).toBe(1);
    cpu.reset();
    expect(cpu.eiDelay).toBe(0);
  });
});
