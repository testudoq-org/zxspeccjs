/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node
/**
 * Display diagnostic - Check if ROM boot generates copyright message
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import spec48 from './src/roms/spec48.js';

console.log('🔍 Display Diagnostic Test');
console.log('============================\n');

// Setup
const romBytes = new Uint8Array(spec48.bytes);
const memory = new Memory({ model: '48k', romBuffer: romBytes });
const cpu = new Z80(memory);
memory.attachCPU(cpu);
cpu.reset();

// Enable interrupts after some cycles (emulate boot)
cpu.IFF1 = true;
cpu.IFF2 = true;

console.log(`ROM loaded, first 10 bytes: ${Array.from(romBytes.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`CPU started at PC=0x${cpu.PC.toString(16)}`);

// Run many frames worth of CPU cycles
const TSTATES_PER_FRAME = 69888;
const FRAMES_TO_RUN = 100;
const TOTAL_TSTATES = TSTATES_PER_FRAME * FRAMES_TO_RUN;

console.log(`\nRunning ${FRAMES_TO_RUN} frames (${TOTAL_TSTATES} T-states)...\n`);

let tstatesRun = 0;
let lastPC = -1;
let stuckCount = 0;
let interruptCount = 0;

while (tstatesRun < TOTAL_TSTATES) {
  // Generate interrupt at frame boundary
  if (tstatesRun > 0 && (tstatesRun % TSTATES_PER_FRAME) < 10) {
    if (cpu.IFF1) {
      cpu.intRequested = true;
      interruptCount++;
    }
  }
  
  const ts = cpu.step();
  tstatesRun += ts;
  
  // Check for stuck
  if (cpu.PC === lastPC) {
    stuckCount++;
    if (stuckCount > 1000) {
      console.log(`⚠️ CPU stuck at PC=0x${cpu.PC.toString(16)}`);
      break;
    }
  } else {
    stuckCount = 0;
  }
  lastPC = cpu.PC;
}

console.log(`Ran ${tstatesRun} T-states, ${interruptCount} interrupts generated`);
console.log(`Final PC=0x${cpu.PC.toString(16)}\n`);

// Check display memory
console.log('=== Display Memory Analysis ===\n');

// Read bitmap area (0x4000-0x57FF)
const bitmap = new Uint8Array(0x1800);
for (let i = 0; i < 0x1800; i++) {
  bitmap[i] = memory.read(0x4000 + i);
}

// Read attributes area (0x5800-0x5AFF)
const attrs = new Uint8Array(0x300);
for (let i = 0; i < 0x300; i++) {
  attrs[i] = memory.read(0x5800 + i);
}

// Count non-zero bytes
const bitmapNonZero = bitmap.filter(b => b !== 0).length;
const attrsNonDefault = attrs.filter(b => b !== 0x38).length; // 0x38 = white on black default

console.log(`Bitmap non-zero bytes: ${bitmapNonZero}/${bitmap.length}`);
console.log(`Attributes non-default bytes: ${attrsNonDefault}/${attrs.length}`);

// Check first character line (top of screen)
console.log('\nFirst character line bitmap (bytes 0-31):');
let firstLineStr = '';
for (let x = 0; x < 32; x++) {
  firstLineStr += bitmap[x].toString(16).padStart(2, '0') + ' ';
}
console.log(firstLineStr);

// ZX Spectrum character position calculation
// The copyright message appears at line 22 or 23 (near bottom of screen)
// Characters are 8 pixels tall, so line 22 starts at pixel line 176
// 
// For pixel line 176:
// y2 = 176 >> 6 = 2
// y1 = (176 >> 3) & 7 = 6  
// y0 = 176 & 7 = 0
// 
// Bitmap address for line 176, column 0 = (0 << 8) + (6 << 5) + (2 << 11) + 0 = 0 + 192 + 4096 + 0 = 4288 = 0x10C0

console.log('\nChecking line 176 (char line 22) - where copyright might appear:');
for (let charLine = 0; charLine < 8; charLine++) {
  const y = 176 + charLine;
  const y0 = y & 0x07;
  const y1 = (y >> 3) & 0x07;
  const y2 = (y >> 6) & 0x03;
  const baseAddr = (y0 << 8) | (y1 << 5) | (y2 << 11);
  
  let lineStr = `Line ${y} (addr 0x${baseAddr.toString(16)}): `;
  for (let x = 0; x < 32; x++) {
    lineStr += bitmap[baseAddr + x].toString(16).padStart(2, '0') + ' ';
  }
  console.log(lineStr);
}

// Check system variables
console.log('\n=== System Variables ===');
const CHARS = memory.read(0x5C36) | (memory.read(0x5C37) << 8);
const FRAMES = memory.read(0x5C5C) | (memory.read(0x5C5D) << 8);
const DF_CC = memory.read(0x5C84) | (memory.read(0x5C85) << 8);
const S_POSN_X = memory.read(0x5C88);
const S_POSN_Y = memory.read(0x5C89);

console.log(`CHARS (character set): 0x${CHARS.toString(16)}`);
console.log(`FRAMES (frame counter): ${FRAMES}`);
console.log(`DF_CC (display file addr): 0x${DF_CC.toString(16)}`);
console.log(`S_POSN (print position): col=${S_POSN_X}, row=${S_POSN_Y}`);

// Check if we can extract text from attributes
console.log('\n=== Looking for character patterns ===');

// Look for patterns that could be text
// ZX Spectrum character set has © at code 127
// The ROM copyright message is "© 1982 Sinclair Research Ltd"

// Check the bottom few lines of screen
for (let row = 20; row < 24; row++) {
  const attrBase = row * 32;
  let rowText = `Row ${row} attrs: `;
  for (let col = 0; col < 32; col++) {
    rowText += attrs[attrBase + col].toString(16).padStart(2, '0') + ' ';
  }
  console.log(rowText);
}

console.log('\nDone!');

