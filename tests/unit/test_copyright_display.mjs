/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

#!/usr/bin/env node

/**
 * Test to verify the copyright message display in the emulator
 * This will run the emulator headlessly and check the display memory
 */

import spec48 from './src/roms/spec48.js';
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

const rom = spec48.bytes;

// Create memory and CPU
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

console.log('=== Testing Copyright Display in Emulator ===\n');

// Verify ROM is loaded correctly
console.log('1. Verifying ROM loaded correctly:');
const romAddr = 0x1539;
console.log(`   ROM @ 0x${romAddr.toString(16)}: 0x${memory.read(romAddr).toString(16).padStart(2,'0')} (should be 0x7f for ©)`);

// Verify character set is accessible
console.log('\n2. Verifying character set in ROM:');
const charSetBase = 0x3D00;
const copyrightCharOffset = (0x7F - 0x20) * 8;
const copyrightCharAddr = charSetBase + copyrightCharOffset;
console.log(`   © character bitmap @ 0x${copyrightCharAddr.toString(16)}:`);
for (let row = 0; row < 8; row++) {
  const byte = memory.read(copyrightCharAddr + row);
  console.log(`     Row ${row}: 0x${byte.toString(16).padStart(2,'0')}`);
}

// Reset CPU and run boot sequence
console.log('\n3. Running boot sequence...');
cpu.reset();

// The boot sequence needs many cycles to complete
// Let's run for ~5 million T-states (about 1.4 seconds of emulated time)
const MAX_TSTATES = 5000000;
let tstates = 0;

while (tstates < MAX_TSTATES) {
  const cycles = cpu.step();
  tstates += cycles;
}

console.log(`   Ran ${tstates} T-states`);
console.log(`   PC is now at: 0x${cpu.PC.toString(16).padStart(4,'0')}`);

// Check display memory for the copyright message
console.log('\n4. Checking display memory for copyright message...');

// The copyright message is typically displayed on line 21 (near bottom)
// ZX Spectrum display layout: 
// - Screen memory: 0x4000-0x57FF (bitmap)
// - Attributes: 0x5800-0x5AFF

// Read the bitmap memory and look for character patterns
const bitmapStart = 0x4000;
const bitmapSize = 0x1800;

// Function to convert screen line/column to memory address
function screenAddress(line, col) {
  // ZX Spectrum memory layout for bitmap:
  // Address = 0x4000 + ((line & 0x07) << 8) | ((line & 0x38) << 2) | ((line & 0xC0) << 5) | col
  const y = line * 8; // convert character line to pixel line
  const addr = bitmapStart | ((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | col;
  return addr;
}

// Check CHARS system variable (0x5C36) - points to character set - 256
const charsLo = memory.read(0x5C36);
const charsHi = memory.read(0x5C37);
const charsPtr = (charsHi << 8) | charsLo;
console.log(`   CHARS system variable: 0x${charsPtr.toString(16).padStart(4,'0')} (should be 0x3C00)`);

// Let's check if any copyright-related patterns are in display memory
console.log('\n5. Scanning display memory for © pattern...');

// The © character pattern is:
const copyrightPattern = [0x3c, 0x42, 0x99, 0xa1, 0xa1, 0x99, 0x42, 0x3c];

// Scan through attribute memory to find non-default attributes
// (this indicates where text has been written)
const attrStart = 0x5800;
let foundTextAt = [];
for (let i = 0; i < 768; i++) {
  const attr = memory.read(attrStart + i);
  if (attr !== 0x38 && attr !== 0x00) { // Non-default attribute
    foundTextAt.push(i);
  }
}
console.log(`   Found ${foundTextAt.length} character cells with non-default attributes`);

// Check the character cells on line 21 (copyright line typically)
console.log('\n6. Checking line 21 (copyright line):');
const copyrightLine = 21;
for (let col = 0; col < 32; col++) {
  const attrAddr = attrStart + (copyrightLine * 32) + col;
  const attr = memory.read(attrAddr);
  if (attr !== 0x38) {
    console.log(`   Col ${col}: attr=0x${attr.toString(16).padStart(2,'0')}`);
  }
}

// Read actual screen data for line 21
console.log('\n7. Reading character patterns on line 21:');
let charPatterns = [];
for (let col = 0; col < 32; col++) {
  let pattern = [];
  for (let row = 0; row < 8; row++) {
    const y = copyrightLine * 8 + row;
    const addr = bitmapStart | ((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | col;
    pattern.push(memory.read(addr));
  }
  charPatterns.push(pattern);
  
  // Check if this matches the © pattern
  let isCopyright = true;
  for (let i = 0; i < 8; i++) {
    if (pattern[i] !== copyrightPattern[i]) {
      isCopyright = false;
      break;
    }
  }
  
  if (isCopyright) {
    console.log(`   ✅ Found © symbol at column ${col}!`);
  }
}

// Also check a few columns for any non-zero patterns
let foundChars = 0;
for (let col = 0; col < 32; col++) {
  const hasContent = charPatterns[col].some(b => b !== 0);
  if (hasContent) {
    foundChars++;
  }
}
console.log(`   Characters with content on line 21: ${foundChars}/32`);

// Final check: Look for specific character patterns
console.log('\n8. Looking for "1982" pattern...');
// "1" character pattern
const char1Pattern = [0x18, 0x28, 0x08, 0x08, 0x08, 0x3e, 0x00, 0x00]; // May vary slightly

for (let col = 0; col < 32; col++) {
  const pattern = charPatterns[col];
  // Check if there's any recognizable digit pattern
  const sum = pattern.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    const hex = pattern.map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`   Col ${col}: ${hex}`);
  }
}

