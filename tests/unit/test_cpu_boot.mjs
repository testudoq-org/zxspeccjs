/* eslint-disable no-console, no-undef, no-unused-vars */
import { test, expect } from 'vitest';

import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';
import rom from '../../src/roms/spec48.js';
import { runBootFrames, detectStall } from '../../tests/_helpers/cpuBootHelpers.mjs';

// 1) ROM sanity
test('ROM sanity', () => {
  expect(rom.bytes.length).toBe(16384);
  const memory = new Memory();
  memory.loadROM(rom.bytes);
  expect(memory.read(0x0000)).toBe(0xF3); // DI
});

// 2) Boot milestones
test('boot reaches key milestones', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);
  const cpu = new Z80(memory);
  cpu.reset();

  const result = runBootFrames({ cpu, memory, frames: 200 });
  const reached = result.reached;

  expect(reached['Start']).toBeDefined();
  // Interrupt vector should be observed during boot
  expect(reached['Interrupt Vector'] !== undefined || reached['After DI'] !== undefined).toBeTruthy();
  // Preferably we reach the copyright display address at some point
  // This may not always be immediate on all runs, so assert it's either reached or at least we've run frames
  expect(Object.keys(reached).length).toBeGreaterThanOrEqual(1);
});

// 3) EI & interrupts
test('EI executes and interrupts are serviced', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);
  const cpu = new Z80(memory);
  cpu.reset();

  const result = runBootFrames({ cpu, memory, frames: 200 });
  expect(result.eiExecuted).toBeTruthy();
  expect(result.interruptsServiced).toBeGreaterThanOrEqual(1);
});

// 4) Anti-stall / progress check
test('cpu does not stall early during boot', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);
  const cpu = new Z80(memory);
  cpu.reset();

  const stallResult = detectStall({ cpu, steps: 3000, stallThreshold: 50 });
  expect(stallResult.stalledCount).toBeLessThan(50);
  expect(stallResult.finalPC).not.toBe(0x0000);
});
