/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

/**
 * Run boot sequence longer to see if copyright message gets printed
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k' });
memory.loadROM(romData);
const cpu = new Z80(memory);
memory.attachCPU(cpu);
cpu.reset();

// Run a lot of instructions
const maxInstructions = 5000000; // 5 million
let count = 0;
let errorHit = false;

console.log('Running boot sequence (looking for copyright message or error)...');
const startTime = Date.now();

while (count < maxInstructions) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  
  // Check for RST 08 (error)
  if (opcode === 0xCF) {
    console.log(`\n*** RST 08 (error) at PC=0x${pc.toString(16).padStart(4, '0')} after ${count} instructions!`);
    console.log(`    SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
    console.log(`    A: 0x${cpu.A.toString(16).padStart(2, '0')} (error code)`);
    errorHit = true;
    break;
  }
  
  // Progress indicator
  if (count % 1000000 === 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[${count/1000000}M] PC=0x${pc.toString(16).padStart(4,'0')} SP=0x${cpu.SP.toString(16).padStart(4,'0')} (${elapsed.toFixed(1)}s)`);
  }
  
  cpu.step();
  count++;
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`\nCompleted in ${elapsed.toFixed(1)} seconds`);
console.log(`Total instructions: ${count}`);

// Check video memory for copyright message
console.log('\nChecking video memory for text...');

// Read some video memory
const VIDEO_START = 0x4000;
const ATTR_START = 0x5800;

// Check first few lines of video memory for patterns
console.log('\nFirst line of video memory (0x4000-0x401F):');
let line = '';
for (let i = 0; i < 32; i++) {
  const b = memory.read(VIDEO_START + i);
  line += b.toString(16).padStart(2, '0') + ' ';
}
console.log(line);

// Check attribute area for colors
console.log('\nFirst row of attributes (0x5800-0x581F):');
line = '';
for (let i = 0; i < 32; i++) {
  const b = memory.read(ATTR_START + i);
  line += b.toString(16).padStart(2, '0') + ' ';
}
console.log(line);

// Read character ROM locations that might show "1982"
// The ZX Spectrum copyright message is displayed using the PRINT routine

// Check if there's been writing to video area
let nonZeroPixels = 0;
for (let i = 0; i < 6144; i++) {
  if (memory.read(VIDEO_START + i) !== 0) nonZeroPixels++;
}
console.log(`\nNon-zero pixels in video memory: ${nonZeroPixels}`);

// Check attributes for non-default values
let nonDefaultAttrs = 0;
for (let i = 0; i < 768; i++) {
  const attr = memory.read(ATTR_START + i);
  if (attr !== 0x38) nonDefaultAttrs++; // 0x38 is white on black
}
console.log(`Non-default attributes: ${nonDefaultAttrs}`);

// Final state
console.log('\nFinal state:');
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  IFF1: ${cpu.IFF1}`);

