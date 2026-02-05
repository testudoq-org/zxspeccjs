/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Test ROM boot with interrupts (moved from tests/unit)
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

cpu.io = { read: () => 0xFF, write: () => {} };
cpu.reset();

// Suppress memory logs
console.log('Running 100 frames of ROM boot...\n');

for (let frame = 0; frame < 100; frame++) {
  // Run one frame worth of tstates
  for (let i = 0; i < 70000; i++) {
    cpu.step();
  }
  // Trigger interrupt if enabled
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
}

console.log('After 100 frames:');
console.log('  IY = 0x' + cpu.IY.toString(16).padStart(4, '0') + ' (should be 0x5C3A for keyboard to work)');
console.log('  PC = 0x' + cpu.PC.toString(16).padStart(4, '0'));
console.log('  IFF1 = ' + cpu.IFF1);
console.log('  FLAGS (0x5C3B) = 0x' + memory.read(0x5C3B).toString(16).padStart(2, '0'));
console.log('  LASTK (0x5C08) = 0x' + memory.read(0x5C08).toString(16).padStart(2, '0'));
console.log('  CHARS (0x5C36) = 0x' + (memory.read(0x5C36) + memory.read(0x5C37) * 256).toString(16).padStart(4, '0'));
console.log('');
if (cpu.IY === 0x5C3A) {
  console.log('✓ IY correctly initialized - ROM boot succeeded');
} else {
  console.log('✗ IY NOT initialized - ROM boot failed');
}
