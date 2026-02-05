/**
 * Trace attribute writes during boot to find the bug
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

// Patch Memory.write to log writes to attribute area
const originalWrite = mem.write.bind(mem);
let attrWriteCount = 0;
let lastAttrWrites = [];

mem.write = function(addr, val) {
  // Track writes to attribute area
  if (addr >= 0x5800 && addr < 0x5B00) {
    attrWriteCount++;
    if (lastAttrWrites.length < 50) {
      lastAttrWrites.push({ addr, val, pc: cpu.PC });
    }
  }
  return originalWrite(addr, val);
};

console.log('Running 50 frames of boot (just enough to set up screen)...');

for (let frame = 0; frame < 50; frame++) {
  for (let t = 0; t < 69888; t++) {
    cpu.step();
  }
  if (cpu.iff1) cpu.interrupt();
}

console.log(`\nTotal attribute writes: ${attrWriteCount}`);
console.log(`\nFirst 50 attribute writes:`);
for (const w of lastAttrWrites) {
  const col = (w.addr - 0x5800) % 32;
  const row = Math.floor((w.addr - 0x5800) / 32);
  console.log(`  PC=0x${w.pc.toString(16).padStart(4, '0')} addr=0x${w.addr.toString(16)} (row=${row}, col=${col}) val=0x${w.val.toString(16).padStart(2, '0')}`);
}

// Check attribute pattern
console.log('\n--- ATTRIBUTE CHECK AFTER 50 FRAMES ---');
let zeros = 0, nonZeros = 0;
for (let i = 0; i < 768; i++) {
  if (mem.read(0x5800 + i) === 0) zeros++;
  else nonZeros++;
}
console.log(`Zeros: ${zeros}, Non-zeros: ${nonZeros}`);

// Check first row
console.log('\nFirst row attributes:');
for (let col = 0; col < 32; col++) {
  const val = mem.read(0x5800 + col);
  process.stdout.write(val.toString(16).padStart(2, '0') + ' ');
}
console.log();
