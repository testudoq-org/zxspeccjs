/**
 * Run boot with interrupt simulation to see copyright message
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

// Run with interrupt simulation
const FRAME_TSTATES = 69888; // T-states per frame
let totalTstates = 0;
let frameCount = 0;
const maxFrames = 10; // Run for 10 frames (0.2 seconds)

console.log('Running boot with interrupts (10 frames)...');
const startTime = Date.now();

while (frameCount < maxFrames) {
  // Reset tstates at frame start
  cpu.tstates = 0;
  
  // Run until frame boundary
  while (cpu.tstates < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Check for RST 08 (error)
    if (opcode === 0xCF) {
      console.log(`\n*** RST 08 (error) at PC=0x${pc.toString(16).padStart(4, '0')} frame ${frameCount}!`);
      console.log(`    SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
      console.log(`    A: 0x${cpu.A.toString(16).padStart(2, '0')} (error code)`);
      frameCount = maxFrames; // Exit outer loop
      break;
    }
    
    cpu.step();
  }
  
  totalTstates += cpu.tstates;
  
  // Trigger interrupt at frame boundary
  if (cpu.IFF1) {
    cpu.interrupt();
  }
  
  frameCount++;
  console.log(`Frame ${frameCount}: PC=0x${cpu.PC.toString(16).padStart(4,'0')} SP=0x${cpu.SP.toString(16).padStart(4,'0')} IFF1=${cpu.IFF1}`);
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`\nCompleted in ${elapsed.toFixed(1)} seconds`);
console.log(`Total tstates: ${totalTstates}`);

// Check video memory for copyright message
console.log('\nChecking video memory for text...');

// Read some video memory - looking for the copyright message
// The message "© 1982 Sinclair Research Ltd" starts at line 21 or so

const VIDEO_START = 0x4000;
const ATTR_START = 0x5800;

// Check if there's been writing to video area
let nonZeroPixels = 0;
for (let i = 0; i < 6144; i++) {
  if (memory.read(VIDEO_START + i) !== 0) nonZeroPixels++;
}
console.log(`\nNon-zero pixels in video memory: ${nonZeroPixels}`);

// If there are non-zero pixels, let's visualize them
if (nonZeroPixels > 0) {
  console.log('\nVideo memory visualization (top-left 16x8 pixel area as ASCII):');
  for (let row = 0; row < 8; row++) {
    let line = '';
    for (let col = 0; col < 16; col++) {
      // Calculate screen address (it's weird due to ZX Spectrum layout)
      const addr = VIDEO_START + (row * 32) + col;
      const byte = memory.read(addr);
      for (let bit = 7; bit >= 0; bit--) {
        line += (byte & (1 << bit)) ? '#' : '.';
      }
    }
    console.log(line);
  }
}

// Check attributes for non-default values
let nonDefaultAttrs = 0;
for (let i = 0; i < 768; i++) {
  const attr = memory.read(ATTR_START + i);
  if (attr !== 0x38) nonDefaultAttrs++;
}
console.log(`\nNon-default attributes: ${nonDefaultAttrs}`);

// Final state
console.log('\nFinal state:');
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  IFF1: ${cpu.IFF1}`);
console.log(`  IFF2: ${cpu.IFF2}`);
