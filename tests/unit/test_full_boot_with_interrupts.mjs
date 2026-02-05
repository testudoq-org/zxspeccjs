/**
 * Full boot test with proper interrupt handling
 * Based on JSSpeccy3's core.ts.in:
 * - Interrupts only trigger when t < 36 (within first 36 tstates of frame)
 * - IFF1 must be true
 * - Frame is 69888 tstates for 48K
 */
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import spec48 from './src/roms/spec48.js';

const FRAME_TSTATES = 69888; // ZX Spectrum 48K frame length
const INTERRUPT_WINDOW = 36; // Interrupts trigger within first 36 tstates

const rom = new Uint8Array(spec48.bytes);
console.log('ROM loaded, size:', rom.length);

const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

// Track frame and tstates within frame
let frameCount = 0;
let frameT = 0;

// Track key events
let eiReached = false;
let eiPC = 0;
let interruptCount = 0;
let lastVideoCheck = { nonZeroPixels: 0, nonDefaultAttrs: 0 };

// Track halt occurrences
let haltCount = 0;
let lastHaltPC = 0;

// Max frames to run (at 50fps, 100 frames = 2 seconds of emulation)
const MAX_FRAMES = 200;

console.log('Starting boot with proper interrupt timing...\n');
console.log(`Frame = ${FRAME_TSTATES} tstates, Interrupt window = first ${INTERRUPT_WINDOW} tstates`);
console.log('');

function checkVideoMemory() {
  // Video memory: 0x4000-0x57FF = bitmap, 0x5800-0x5AFF = attributes
  let nonZeroPixels = 0;
  let nonDefaultAttrs = 0;
  
  for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0x00) nonZeroPixels++;
  }
  
  for (let addr = 0x5800; addr < 0x5B00; addr++) {
    const attr = memory.read(addr);
    // Default attribute is 0x38 (white ink on white paper - or 0x00)
    if (attr !== 0x38 && attr !== 0x00) nonDefaultAttrs++;
  }
  
  return { nonZeroPixels, nonDefaultAttrs };
}

// Run one frame
function runFrame() {
  frameT = 0;
  
  // Trigger interrupt at frame start if interrupts are enabled
  if (cpu.IFF1) {
    cpu.intRequested = true;
    interruptCount++;
  }
  
  while (frameT < FRAME_TSTATES) {
    const tstatesBefore = cpu.tstates;
    
    // Check for HALT (0x76) - if halted, just advance time until interrupt
    const opcode = memory.read(cpu.PC);
    if (opcode === 0x76) {
      haltCount++;
      lastHaltPC = cpu.PC;
      // HALT: CPU advances PC after interrupt, so we wait
      // If IFF1 is disabled, we'd loop forever, so break
      if (!cpu.IFF1) {
        console.log('HALT with IFF1=false - breaking');
        break;
      }
      // Wait for interrupt - skip to next frame
      frameT = FRAME_TSTATES;
      cpu.tstates += (FRAME_TSTATES - frameT);
      break;
    }
    
    cpu.step();
    
    const elapsed = cpu.tstates - tstatesBefore;
    frameT += elapsed;
    
    // Track when EI is first reached
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      eiPC = cpu.PC;
      const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
      console.log(`EI reached at frame ${frameCount}, PC=0x${cpu.PC.toString(16)}`);
      console.log(`  RAMTOP=0x${ramtop.toString(16)}, SP=0x${cpu.SP.toString(16)}`);
    }
  }
  
  // Clear interrupt request for next frame
  cpu.intRequested = false;
  frameCount++;
}

// Main loop
for (let frame = 0; frame < MAX_FRAMES; frame++) {
  runFrame();
  
  // Check video memory every 10 frames after EI
  if (eiReached && frame % 10 === 0) {
    const video = checkVideoMemory();
    if (video.nonZeroPixels !== lastVideoCheck.nonZeroPixels || 
        video.nonDefaultAttrs !== lastVideoCheck.nonDefaultAttrs) {
      console.log(`Frame ${frame}: Video changed - ${video.nonZeroPixels} non-zero pixels, ${video.nonDefaultAttrs} non-default attrs`);
      lastVideoCheck = video;
    }
  }
  
  // Status update every 50 frames
  if (frame % 50 === 0) {
    console.log(`Frame ${frame}: PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}, IFF1=${cpu.IFF1}, IM=${cpu.IM}, Interrupts=${interruptCount}`);
  }
}

console.log('\n=== Final Status ===');
console.log(`Frames run: ${frameCount}`);
console.log(`Total tstates: ${cpu.tstates}`);
console.log(`EI reached: ${eiReached} at PC=0x${eiPC.toString(16)}`);
console.log(`Interrupts triggered: ${interruptCount}`);
console.log(`HALTs encountered: ${haltCount}, last at PC=0x${lastHaltPC.toString(16)}`);
console.log(`Final: PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}, IFF1=${cpu.IFF1}, IM=${cpu.IM}`);

// Check video memory
const finalVideo = checkVideoMemory();
console.log(`\nVideo memory:`);
console.log(`  Non-zero pixels: ${finalVideo.nonZeroPixels}`);
console.log(`  Non-default attributes: ${finalVideo.nonDefaultAttrs}`);

// Check system variables
const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
const errsp = memory.read(0x5C3D) | (memory.read(0x5C3E) << 8);
const errNr = memory.read(0x5C3A);
console.log(`\nSystem variables:`);
console.log(`  RAMTOP: 0x${ramtop.toString(16)}`);
console.log(`  ERRSP: 0x${errsp.toString(16)}`);
console.log(`  ERR_NR: ${errNr}`);

// Sample the copyright message area in video memory
// The copyright message appears at the bottom of the screen
// Line 21-22 in character coordinates (168-184 in pixel Y)
console.log('\n=== Checking for copyright message ===');
// Video line 168-191 = pixel addresses around 0x4000 + line calculation
// Line y: addr = 0x4000 | ((y & 0xC0) << 5) | ((y & 0x07) << 8) | ((y & 0x38) << 2)
const checkLine = (y) => {
  const lineAddr = 0x4000 | ((y & 0xC0) << 5) | ((y & 0x07) << 8) | ((y & 0x38) << 2);
  let hasData = false;
  for (let x = 0; x < 32; x++) {
    if (memory.read(lineAddr + x) !== 0) hasData = true;
  }
  return hasData;
};

for (let line = 160; line < 192; line++) {
  if (checkLine(line)) {
    console.log(`  Line ${line} has pixel data`);
  }
}

// Dump attribute area (bottom portion where message should be)
console.log('\nAttribute check (bottom 3 lines):');
for (let attrY = 21; attrY < 24; attrY++) {
  const attrBase = 0x5800 + attrY * 32;
  let nonDefault = 0;
  for (let x = 0; x < 32; x++) {
    const attr = memory.read(attrBase + x);
    if (attr !== 0x38 && attr !== 0x00) nonDefault++;
  }
  console.log(`  Row ${attrY}: ${nonDefault} non-default attributes`);
}
