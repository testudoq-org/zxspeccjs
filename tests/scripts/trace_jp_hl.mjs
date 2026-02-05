/**
 * Trace the JP (HL) at 0x162C which is how RST 10 calls the output routine
 */
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import spec48 from './src/roms/spec48.js';

const FRAME_TSTATES = 69888;
const rom = new Uint8Array(spec48.bytes);
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

let frameCount = 0;
let eiReached = false;
let tracing = false;
let traceCount = 0;

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`EI reached at frame ${frameCount}\n`);
    }
    
    // Watch for JP (HL) at 0x162C
    if (pc === 0x162C && eiReached && traceCount < 5) {
      const hl = cpu._getHL();
      traceCount++;
      console.log(`JP (HL) at 0x162C:`);
      console.log(`  HL = 0x${hl.toString(16)} - jumping to this address`);
      console.log(`  A (char to print) = 0x${cpu.A.toString(16)} '${cpu.A >= 32 && cpu.A < 127 ? String.fromCharCode(cpu.A) : '?'}'`);
      
      // What's at HL?
      console.log(`  Code at HL (0x${hl.toString(16)}):`);
      for (let i = 0; i < 10; i++) {
        console.log(`    0x${(hl+i).toString(16)}: 0x${memory.read(hl+i).toString(16)}`);
      }
      console.log('');
    }
    
    // Start detailed trace at RST 10 for '1'
    if (opcode === 0xD7 && eiReached && cpu.A === 0x31 && !tracing) {
      tracing = true;
      console.log('=== Starting detailed trace for \'1\' ===');
    }
    
    // Trace important PCs
    if (tracing && traceCount < 500) {
      if (pc === 0x09F4) console.log(`  PRINT-OUT at 0x09F4`);
      if (pc === 0x0B24) console.log(`  PO-CHAR at 0x0B24`);
      if (pc === 0x0B93) console.log(`  PR-ALL at 0x0B93`);
      
      // Watch for RET back to main code
      if (opcode === 0xC9) {
        const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
        if (retAddr > 0x1200) {
          console.log(`  RET to 0x${retAddr.toString(16)} (exiting print)`);
          tracing = false;
        }
      }
    }
    
    if (opcode === 0x76 && !cpu.IFF1) break;
    if (opcode === 0x76) { frameT = FRAME_TSTATES; break; }
    
    const tsBefore = cpu.tstates;
    cpu.step();
    frameT += (cpu.tstates - tsBefore);
  }
  
  cpu.intRequested = false;
  frameCount++;
}

console.log('=== Tracing JP (HL) at 0x162C ===\n');

for (let f = 0; f < 100; f++) {
  runFrame();
}

// Check CURCHL 
const curchl = memory.read(0x5C51) | (memory.read(0x5C52) << 8);
console.log(`\nCURCHL: 0x${curchl.toString(16)}`);
console.log(`Output routine stored at CURCHL: 0x${(memory.read(curchl) | (memory.read(curchl+1) << 8)).toString(16)}`);

// Video check
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`\nNon-zero video bytes: ${nonZero}`);
