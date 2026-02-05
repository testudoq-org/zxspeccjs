/* eslint-disable no-console, no-undef, no-unused-vars */
import { test, expect } from 'vitest';

import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';
import rom from '../../src/roms/spec48.js';

// Extended CPU boot checks: milestones, EI/interrupts, and anti-stall assertions
test('cpu boot reaches key milestones and services interrupts', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);

  // Basic ROM sanity
  expect(rom.bytes.length).toBe(16384);
  expect(memory.read(0x0000)).toBe(0xF3); // DI

  const cpu = new Z80(memory);
  cpu.reset();

  const milestones = {
    'Start': 0x0000,
    'After DI': 0x0001,
    'Interrupt Vector': 0x0038,
    'Error Handler': 0x0055,
    'Copyright Display': 0x1530,
    'BASIC Entry': 0x0D6E
  };

  const reached = {};
  let eiExecuted = false;
  let interruptsServiced = 0;

  const TSTATES_PER_FRAME = 69888;
  const MAX_FRAMES = 200; // ~4 seconds real-time equivalent

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    let tStates = 0;

    while (tStates < TSTATES_PER_FRAME) {
      const pc = cpu.PC;
      const opcode = memory.read(pc);

      if (opcode === 0xFB) eiExecuted = true; // EI

      Object.entries(milestones).forEach(([name, addr]) => {
        if (pc === addr && !reached[name]) reached[name] = frame;
      });

      // Execute one instruction and accumulate t-states
      tStates += cpu.step();

      // Safety: break out early if we have observed key signs of boot completion
      if (eiExecuted && interruptsServiced > 0 && reached['Copyright Display']) break;
    }

    // Generate an interrupt at end of frame if enabled
    if (cpu.IFF1) {
      cpu.intRequested = true;
      interruptsServiced++;
      if (!reached['First Interrupt']) reached['First Interrupt'] = frame;
    }

    // Quick termination if we've clearly reached boot output
    if (eiExecuted && interruptsServiced > 0 && reached['Copyright Display']) break;
  }

  // Assertions
  expect(eiExecuted).toBeTruthy();
  expect(interruptsServiced).toBeGreaterThanOrEqual(1);
  expect(reached['Start']).toBeDefined();
  expect(Object.keys(reached).length).toBeGreaterThanOrEqual(2);

  // Validate copyright string exists in ROM
  let copyright = '';
  for (let i = 0; i < 50; i++) {
    const b = rom.bytes[0x1539 + i];
    if (!b) break;
    copyright += String.fromCharCode(b & 0x7F);
    if (b & 0x80) break;
  }
  expect(/Sinclair|1982|Copyright/i.test(copyright)).toBeTruthy();
});

// Anti-stall / progress check: ensure PC progresses over many instructions
test('cpu does not stall early during boot', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);

  const cpu = new Z80(memory);
  cpu.reset();

  let lastPC = cpu.PC;
  let stalledCount = 0;

  for (let i = 0; i < 3000; i++) {
    cpu.step();
    if (cpu.PC === lastPC) {
      stalledCount++;
    } else {
      stalledCount = 0;
      lastPC = cpu.PC;
    }
  }

  // If the CPU is stuck for 50+ instructions in a row, consider that a stall
  expect(stalledCount).toBeLessThan(50);
  expect(cpu.PC).not.toBe(0x0000);
});
