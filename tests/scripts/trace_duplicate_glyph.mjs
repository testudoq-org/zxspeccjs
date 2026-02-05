/* eslint-disable no-console, no-undef, no-unused-vars */
// Trace duplicate copyright glyph rendering
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

console.log('=== Duplicate Copyright Glyph Diagnostic ===\n');

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

// Track writes to screen memory (0x4000-0x57FF) for copyright symbol detection
const screenWrites = [];

// Patch memory write to track screen writes
const originalWrite = memory.write.bind(memory);
memory.write = function(addr, value) {
  if (addr >= 0x4000 && addr < 0x5800) {
    screenWrites.push({ addr, value, pc: cpu.PC, t: cpu.tstates });
  }
  return originalWrite(addr, value);
};

// Also track writes to CHARS system variable
const charsWrites = [];
const originalWrite2 = memory.write.bind(memory);
memory.write = function(addr, value) {
  if (addr === 0x5C36 || addr === 0x5C37) {
    charsWrites.push({ addr, value, pc: cpu.PC, t: cpu.tstates });
    console.log(`[CHARS] Write to 0x${addr.toString(16)} = 0x${value.toString(16)} at PC=0x${cpu.PC.toString(16)}`);
  }
  if (addr >= 0x4000 && addr < 0x5800) {
    screenWrites.push({ addr, value, pc: cpu.PC, t: cpu.tstates });
  }
  return originalWrite(addr, value);
};

// Set up minimal IO
cpu.io = {
  read: (port) => {
    if ((port & 0xFF) === 0xFE) return 0xFF;
    return 0xFF;
  },
  write: () => {}
};

// Run boot sequence
cpu.reset();
const maxCycles = 2000000; // ~28ms of emulation
let cycles = 0;
let frameCount = 0;
const TSTATES_PER_FRAME = 69888;

// Initialize system variables as ROM would during boot
// (These get set by ROM during the boot sequence)

console.log('Running boot sequence...\n');

while (cycles < maxCycles) {
  cpu.step();
  cycles++;
  
  // Track frame boundaries
  if (cpu.tstates >= TSTATES_PER_FRAME * (frameCount + 1)) {
    frameCount++;
  }
  
  // Halt detection - if we hit a HALT and interrupts are enabled, inject an interrupt
  if (cpu.halted && cpu.IFF1) {
    cpu.interrupt();
  }
}

console.log(`\nRan ${cycles} cycles, ${frameCount} frames\n`);
console.log(`Screen writes: ${screenWrites.length}`);
console.log(`CHARS writes: ${charsWrites.length}`);

// Analyze CHARS writes
console.log('\n=== CHARS System Variable Writes ===');
for (const w of charsWrites) {
  console.log(`  0x${w.addr.toString(16)} = 0x${w.value.toString(16)} at PC=0x${w.pc.toString(16)} (t=${w.t})`);
}

// Check what CHARS points to now
const charsLo = memory.read(0x5C36);
const charsHi = memory.read(0x5C37);
const chars = (charsHi << 8) | charsLo;
console.log(`\nFinal CHARS value: 0x${chars.toString(16).padStart(4, '0')}`);

// Find the copyright print routine in screen writes
// The copyright symbol (0x7F) glyph bytes are: 3c 42 99 a1 a1 99 42 3c
const copyrightBytes = [0x3c, 0x42, 0x99, 0xa1, 0xa1, 0x99, 0x42, 0x3c];

console.log('\n=== Looking for Copyright Glyph in Screen Writes ===');

// Group screen writes by PC to find duplicate render locations
const writesByPC = new Map();
for (const w of screenWrites) {
  if (!writesByPC.has(w.pc)) {
    writesByPC.set(w.pc, []);
  }
  writesByPC.get(w.pc).push(w);
}

// Find PCs with many writes (potential render routines)
const sortedPCs = Array.from(writesByPC.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10);

console.log('\nTop 10 PCs by screen write count:');
for (const [pc, writes] of sortedPCs) {
  console.log(`  PC=0x${pc.toString(16).padStart(4, '0')}: ${writes.length} writes`);
}

// Check for duplicate writes to the same screen address
const writesByAddr = new Map();
for (const w of screenWrites) {
  if (!writesByAddr.has(w.addr)) {
    writesByAddr.set(w.addr, []);
  }
  writesByAddr.get(w.addr).push(w);
}

const duplicates = Array.from(writesByAddr.entries())
  .filter(([addr, writes]) => writes.length > 1)
  .slice(0, 20);

console.log(`\nScreen addresses with multiple writes: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log('First 10 duplicates:');
  for (const [addr, writes] of duplicates.slice(0, 10)) {
    console.log(`  0x${addr.toString(16)}: ${writes.length} writes from PCs: ${writes.map(w => '0x' + w.pc.toString(16)).join(', ')}`);
  }
}

