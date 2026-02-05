/* eslint-disable no-console, no-undef, no-unused-vars */
import { test, expect } from 'vitest';

import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';
import rom from '../../src/roms/spec48.js';

// Basic boot sanity checks converted from cpu_boot_test.mjs
test('cpu boot basic sanity', () => {
  const memory = new Memory();
  memory.loadROM(rom.bytes);

  const cpu = new Z80(memory);
  cpu.reset();

  // ROM should start with DI (0xF3)
  expect(memory.read(0x0000)).toBe(0xF3);

  // Stepping a few instructions should advance the PC
  const startPC = cpu.PC;
  for (let i = 0; i < 10; i++) cpu.step();
  expect(cpu.PC).not.toBe(startPC);
});
