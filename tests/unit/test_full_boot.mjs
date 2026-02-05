/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Test full boot sequence with interrupts
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const memory = new Memory();
const cpu = new Z80(memory);

memory.loadROM(rom.bytes);
cpu.reset();

console.log('=== Testing Full Boot Sequence ===');

// Simulate the frame loop with interrupts
const TSTATES_PER_FRAME = 69888;
const MAX_FRAMES = 200; // About 4 seconds of real time

let eiExecuted = false;
let interruptsServiced = 0;
let firstInterruptFrame = -1;

for (let frame = 0; frame < MAX_FRAMES; frame++) {
  let tStates = 0;
  
  while (tStates < TSTATES_PER_FRAME) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Track EI
    if (opcode === 0xFB && !eiExecuted) {
      console.log(`Frame ${frame}: EI executed at PC=0x${pc.toString(16).padStart(4,'0')}`);
      eiExecuted = true;
    }
    
    tStates += cpu.step();
  }
  
  // Generate interrupt at end of frame (only if IFF1 is true)
  if (cpu.IFF1) {
    cpu.intRequested = true;
    interruptsServiced++;
    if (firstInterruptFrame === -1) {
      firstInterruptFrame = frame;
      console.log(`Frame ${frame}: First interrupt generated (IFF1=true)`);
    }
  }
  
  // Progress report every 50 frames
  if (frame % 50 === 0) {
    const HL = (cpu.H << 8) | cpu.L; console.log(`  HL=0x${HL.toString(16).padStart(4,'0')}`);
    console.log(`Frame ${frame}: PC=0x${cpu.PC.toString(16).padStart(4,'0')}, IFF1=${cpu.IFF1}, ints=${interruptsServiced}`);
  }
}

console.log('\n=== Boot Sequence Summary ===');
console.log(`EI executed: ${eiExecuted}`);
console.log(`First interrupt at frame: ${firstInterruptFrame}`);
console.log(`Total interrupts serviced: ${interruptsServiced}`);
console.log(`Final PC: 0x${cpu.PC.toString(16).padStart(4,'0')}`);
console.log(`Final IFF1: ${cpu.IFF1}`);

// Check display memory for copyright message
console.log('\n=== Checking Display Memory ===');
const displayStart = 0x4000;
const attrStart = 0x5800;

// The copyright message "© 1982 Sinclair Research Ltd" should appear
// Let's check if there's any non-default data in display memory
let nonZeroPixels = 0;
let nonDefaultAttrs = 0;

for (let i = 0; i < 6144; i++) {
  const pixel = memory.read(displayStart + i);
  if (pixel !== 0) nonZeroPixels++;
}

for (let i = 0; i < 768; i++) {
  const attr = memory.read(attrStart + i);
  if (attr !== 0x38 && attr !== 0x00) nonDefaultAttrs++;
}

console.log(`Non-zero pixels in display: ${nonZeroPixels}`);
console.log(`Non-default attributes: ${nonDefaultAttrs}`);

// Check for Sinclair copyright string in system variables
console.log('\n=== Checking for copyright text in memory ===');
// The copyright message is stored in ROM at 0x1539
const copyrightAddr = 0x1539;
let copyrightText = '';
for (let i = 0; i < 30; i++) {
  const c = rom.bytes[copyrightAddr + i];
  if (c === 0) break;
  // Spectrum uses inverted bit 7 for end of string
  copyrightText += String.fromCharCode(c & 0x7F);
  if (c & 0x80) break;
}
console.log(`ROM copyright at 0x1539: "${copyrightText}"`);

