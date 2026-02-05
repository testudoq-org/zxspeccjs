/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace RST 10 (print character) to find why video memory isn't being written
 */
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import spec48 from './src/roms/spec48.js';

const FRAME_TSTATES = 69888;
const rom = new Uint8Array(spec48.bytes);
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

let frameCount = 0;
let traceRst10 = false;
let eiReached = false;
let rst10Count = 0;
let firstRst10Frame = null;

// Hook memory writes to track writes to video RAM
const originalWrite = memory.write.bind(memory);
let videoWrites = 0;
memory.write = function(addr, val) {
  if (addr >= 0x4000 && addr < 0x5B00 && traceRst10) {
    videoWrites++;
    if (videoWrites <= 10) {
      console.log(`  VIDEO WRITE: 0x${addr.toString(16)} = 0x${val.toString(16)}`);
    }
  }
  return originalWrite(addr, val);
};

function runFrame() {
  let frameT = 0;
  
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Track EI
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`EI reached at frame ${frameCount}`);
      traceRst10 = true;
    }
    
    // Detailed trace at RST 10
    if (opcode === 0xD7 && traceRst10 && rst10Count < 5) { // RST 10 = 0xD7
      rst10Count++;
      if (firstRst10Frame === null) firstRst10Frame = frameCount;
      console.log(`\n=== RST 10 call #${rst10Count} at frame ${frameCount} ===`);
      console.log(`  A = 0x${cpu.A.toString(16)} '${cpu.A >= 32 && cpu.A < 127 ? String.fromCharCode(cpu.A) : '?'}'`);
      console.log(`  DF_CC (print position): 0x${(memory.read(0x5C84) | (memory.read(0x5C85) << 8)).toString(16)}`);
      console.log(`  ATTR_P (permanent attr): 0x${memory.read(0x5C8D).toString(16)}`);
      console.log(`  ATTR_T (temporary attr): 0x${memory.read(0x5C8F).toString(16)}`);
      console.log(`  P_FLAG: 0x${memory.read(0x5C91).toString(16)}`);
      console.log(`  FLAGS: 0x${memory.read(0x5C3B).toString(16)}`);
      console.log(`  TV_FLAG: 0x${memory.read(0x5C3C).toString(16)}`);
      
      // Trace several instructions after RST 10
      let instCount = 0;
      const maxInst = 200;
      while (instCount < maxInst) {
        const tsBefore = cpu.tstates;
        cpu.step();
        instCount++;
        frameT += (cpu.tstates - tsBefore);
        
        // If we've returned from RST 10 (back to original caller)
        if (cpu.PC > 0x1000) break;
        
        // Watch for key routines
        const subPC = cpu.PC;
        if (subPC === 0x09F4 && instCount < 20) console.log(`  -> PRINT-OUT at 0x09F4`);
        if (subPC === 0x0B24 && instCount < 20) console.log(`  -> PO-CHAR at 0x0B24`);
        if (subPC === 0x0B52 && instCount < 20) console.log(`  -> PO-STORE at 0x0B52`);
        if (subPC === 0x0B93 && instCount < 20) console.log(`  -> PR-ALL at 0x0B93`);
        if (subPC === 0x0BC1 && instCount < 20) console.log(`  -> PR-ALL-2 at 0x0BC1`);
      }
      
      console.log(`  After RST 10: DF_CC = 0x${(memory.read(0x5C84) | (memory.read(0x5C85) << 8)).toString(16)}`);
      console.log(`  Video writes during RST 10: ${videoWrites}`);
      continue;
    }
    
    // HALT detection
    if (opcode === 0x76) {
      if (!cpu.IFF1) break;
      frameT = FRAME_TSTATES;
      break;
    }
    
    const tsBefore = cpu.tstates;
    cpu.step();
    frameT += (cpu.tstates - tsBefore);
  }
  
  cpu.intRequested = false;
  frameCount++;
}

console.log('=== Tracing RST 10 execution ===\n');

// Run enough frames to get past the copyright print
for (let f = 0; f < 100; f++) {
  runFrame();
}

console.log('\n=== Final Analysis ===');
console.log(`Total video writes: ${videoWrites}`);

// Check video memory
let nonZeroPixels = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0x00) nonZeroPixels++;
}
console.log(`Non-zero video bytes: ${nonZeroPixels}`);

// Check DF_CC
const dfCC = memory.read(0x5C84) | (memory.read(0x5C85) << 8);
console.log(`DF_CC (print cursor): 0x${dfCC.toString(16)}`);

// Check attribute memory
let nonDefaultAttrs = 0;
for (let addr = 0x5800; addr < 0x5B00; addr++) {
  const attr = memory.read(addr);
  if (attr !== 0x38 && attr !== 0x00) nonDefaultAttrs++;
}
console.log(`Non-default attributes: ${nonDefaultAttrs}`);

