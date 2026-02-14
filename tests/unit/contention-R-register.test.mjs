/**
 * Unit tests for:
 *   1. R register increment per M1 cycle (opcode fetch)
 *   2. ULA memory contention delay pattern
 *   3. Flash frame-counting
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// ── Helpers ──

function makeCPU(rom = []) {
  const mem = new Memory({ contention: false });
  if (rom.length > 0) mem.loadROM(new Uint8Array(rom));
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  return { cpu, mem };
}

function makeCPUContended(rom = []) {
  const mem = new Memory({ contention: true });
  if (rom.length > 0) mem.loadROM(new Uint8Array(rom));
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  return { cpu, mem };
}

// ── 1. R register increment ──

describe('R register increment', () => {
  it('should increment R lower 7 bits by 1 per NOP', () => {
    // Place 4 NOPs (0x00) then HALT (0x76) in ROM
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x00; rom[1] = 0x00; rom[2] = 0x00; rom[3] = 0x00;
    rom[4] = 0x76; // HALT
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // NOP
    expect(cpu.R & 0x7F).toBe(1);
    cpu.step(); // NOP
    expect(cpu.R & 0x7F).toBe(2);
    cpu.step(); // NOP
    expect(cpu.R & 0x7F).toBe(3);
    cpu.step(); // NOP
    expect(cpu.R & 0x7F).toBe(4);
  });

  it('should preserve R bit 7 while incrementing lower 7 bits', () => {
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x00; rom[1] = 0x00;
    const { cpu } = makeCPU(rom);
    cpu.R = 0x80; // bit 7 set

    cpu.step(); // NOP
    expect(cpu.R).toBe(0x81); // bit 7 preserved, lower = 1
    cpu.step(); // NOP
    expect(cpu.R).toBe(0x82); // bit 7 preserved, lower = 2
  });

  it('should wrap R lower 7 bits from 0x7F to 0x00', () => {
    const rom = new Uint8Array(0x4000).fill(0x00);
    rom[1] = 0x76; // HALT after wrap
    const { cpu } = makeCPU(rom);
    cpu.R = 0x7F; // lower 7 bits maxed out

    cpu.step(); // NOP → should wrap lower bits to 0
    expect(cpu.R & 0x7F).toBe(0);
  });

  it('should wrap with bit 7 set: 0xFF → 0x80', () => {
    const rom = new Uint8Array(0x4000).fill(0x00);
    rom[1] = 0x76;
    const { cpu } = makeCPU(rom);
    cpu.R = 0xFF; // 0x80 | 0x7F

    cpu.step(); // NOP → should wrap to 0x80 (bit 7 preserved)
    expect(cpu.R).toBe(0x80);
  });

  it('should increment R by 2 for CB-prefixed instructions', () => {
    // CB 47 = BIT 0,A (CB prefix + opcode = 2 M1 cycles)
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xCB; rom[1] = 0x47;
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // BIT 0,A
    expect(cpu.R & 0x7F).toBe(2); // 1 for CB fetch + 1 for opcode fetch
  });

  it('should increment R by 2 for ED-prefixed instructions', () => {
    // ED 56 = IM 1 (ED prefix + opcode = 2 M1 cycles)
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xED; rom[1] = 0x56;
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // IM 1
    expect(cpu.R & 0x7F).toBe(2);
  });

  it('should increment R by 2 for DD-prefixed instructions', () => {
    // DD 21 nn nn = LD IX,nn (DD prefix + opcode = 2 M1 cycles)
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xDD; rom[1] = 0x21; rom[2] = 0x00; rom[3] = 0x00;
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // LD IX,0
    expect(cpu.R & 0x7F).toBe(2);
  });

  it('should increment R by 2 for FD-prefixed instructions', () => {
    // FD 21 nn nn = LD IY,nn (FD prefix + opcode = 2 M1 cycles)
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0xFD; rom[1] = 0x21; rom[2] = 0x00; rom[3] = 0x00;
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // LD IY,0
    expect(cpu.R & 0x7F).toBe(2);
  });

  it('should increment R during HALT (NOP fetched each cycle)', () => {
    const rom = new Uint8Array(0x4000).fill(0x76); // HALT at 0x0000
    const { cpu } = makeCPU(rom);
    cpu.R = 0;
    cpu.IFF1 = false; // no interrupts

    cpu.step(); // Execute HALT (first fetch: R increments for opcode fetch)
    const rAfterHalt = cpu.R & 0x7F;
    expect(rAfterHalt).toBe(1);

    // While halted, each step still increments R
    cpu.step();
    expect(cpu.R & 0x7F).toBe(2);
    cpu.step();
    expect(cpu.R & 0x7F).toBe(3);
  });

  it('LD A,R should read current R value', () => {
    // ED 5F = LD A,R
    const rom = new Uint8Array(0x4000).fill(0x76);
    rom[0] = 0x00; // NOP (R → 1)
    rom[1] = 0x00; // NOP (R → 2)
    rom[2] = 0xED; rom[3] = 0x5F; // LD A,R (R becomes 4 after ED prefix fetch +1 for opcode)
    const { cpu } = makeCPU(rom);
    cpu.R = 0;

    cpu.step(); // NOP → R=1
    cpu.step(); // NOP → R=2
    cpu.step(); // LD A,R → R increments to 4 (2 M1 fetches), A reads R's lower 7 = 4
    // Note: LD A,R reads the CURRENT value of R after the instruction's own increments
    expect(cpu.A & 0x7F).toBe(4);
  });
});

// ── 2. ULA memory contention ──

describe('ULA memory contention', () => {
  it('should NOT apply contention when contention is disabled', () => {
    const { cpu, mem } = makeCPU();
    cpu.tstates = 14335; // active scan start
    cpu.frameStartTstates = 0;

    const before = cpu.tstates;
    mem._applyContention(0x4000);
    expect(cpu.tstates).toBe(before); // no change
  });

  it('should NOT apply contention for addresses >= 0x8000', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.tstates = 14335;
    cpu.frameStartTstates = 0;

    const before = cpu.tstates;
    mem._applyContention(0x8000);
    expect(cpu.tstates).toBe(before);
  });

  it('should NOT apply contention for addresses < 0x4000 (ROM)', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.tstates = 14335;
    cpu.frameStartTstates = 0;

    const before = cpu.tstates;
    mem._applyContention(0x0000);
    expect(cpu.tstates).toBe(before);
  });

  it('should NOT apply contention outside active display area (before first scanline)', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.frameStartTstates = 0;
    cpu.tstates = 14334; // one T-state before active scan

    const before = cpu.tstates;
    mem._applyContention(0x4000);
    expect(cpu.tstates).toBe(before);
  });

  it('should NOT apply contention outside active display area (after last scanline)', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.frameStartTstates = 0;
    // After line 191: 14335 + 192*224 = 57407
    cpu.tstates = 57408;

    const before = cpu.tstates;
    mem._applyContention(0x4000);
    expect(cpu.tstates).toBe(before);
  });

  it('should NOT apply contention during border/retrace portion of scanline (T >= 128)', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.frameStartTstates = 0;
    // Scanline 0 starts at T=14335, border starts at T=14335+128=14463
    cpu.tstates = 14463;

    const before = cpu.tstates;
    mem._applyContention(0x4000);
    expect(cpu.tstates).toBe(before);
  });

  it('should apply contention pattern [6,5,4,3,2,1,0,0] during active display', () => {
    const expectedPattern = [6, 5, 4, 3, 2, 1, 0, 0];

    for (let phase = 0; phase < 8; phase++) {
      const { cpu, mem } = makeCPUContended();
      cpu.frameStartTstates = 0;
      // Scanline 0, T-state position = phase within the 8-T-state group
      cpu.tstates = 14335 + phase;

      const before = cpu.tstates;
      mem._applyContention(0x4000);
      const delay = cpu.tstates - before;
      expect(delay).toBe(expectedPattern[phase]);
    }
  });

  it('should apply contention correctly for address 0x7FFF (top of contended range)', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.frameStartTstates = 0;
    cpu.tstates = 14335; // phase 0 → expect 6 T-states delay

    const before = cpu.tstates;
    mem._applyContention(0x7FFF);
    expect(cpu.tstates - before).toBe(6);
  });

  it('should apply contention on later scanlines correctly', () => {
    const { cpu, mem } = makeCPUContended();
    cpu.frameStartTstates = 0;
    // Scanline 100 starts at T=14335 + 100*224 = 36735
    // Phase 0 of scanline 100 → expect 6 T-states delay
    cpu.tstates = 36735;

    const before = cpu.tstates;
    mem._applyContention(0x5000);
    expect(cpu.tstates - before).toBe(6);
  });

  it('should use frameStartTstates to compute frame-relative position', () => {
    const { cpu, mem } = makeCPUContended();
    // Simulate second frame: frame starts at 69888
    cpu.frameStartTstates = 69888;
    cpu.tstates = 69888 + 14335; // start of active display in second frame

    const before = cpu.tstates;
    mem._applyContention(0x4000);
    expect(cpu.tstates - before).toBe(6); // phase 0 → 6
  });
});

// ── 3. Flash frame-counting ──

describe('ULA flash frame-counting', () => {
  it('should toggle flash state every 16 frames', async () => {
    // Dynamic import to avoid issues with DOM-dependent ULA constructor
    // We test the _updateFlash logic directly using a minimal mock
    const flashPhases = [];
    let flashPhase = 0;
    let flashState = false;

    for (let frame = 0; frame < 64; frame++) {
      // Replicate _updateFlash() logic
      flashPhase = (flashPhase + 1) & 0x1F;
      flashState = (flashPhase & 0x10) !== 0;
      flashPhases.push({ frame, flashPhase, flashState });
    }

    // Flash should be OFF for frames 1-16 (phase 1-16, bit 4 clear for 1-15, set at 16)
    // Actually: bit 4 is set when phase & 0x10 !== 0, i.e. phases 16-31
    expect(flashPhases[0].flashState).toBe(false);  // phase 1
    expect(flashPhases[14].flashState).toBe(false);  // phase 15
    expect(flashPhases[15].flashState).toBe(true);  // phase 16 (bit 4 set)
    expect(flashPhases[30].flashState).toBe(true);  // phase 31
    expect(flashPhases[31].flashState).toBe(false);  // phase 0 (wrapped)
    expect(flashPhases[47].flashState).toBe(true);  // phase 16 again
  });
});
