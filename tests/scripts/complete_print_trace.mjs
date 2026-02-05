/**
 * Complete trace of character print path to find where it fails
 * RST 10 -> 0x15F2 -> CALL 0x162C -> eventually writes to video memory
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
let traceActive = false;
let instrCount = 0;
let videoWriteCount = 0;
let charToPrint = 0;

// Track video writes
const originalWrite = memory.write.bind(memory);
memory.write = function(addr, val) {
  if (addr >= 0x4000 && addr < 0x5B00 && traceActive && val !== 0) {
    videoWriteCount++;
    if (videoWriteCount <= 5) {
      console.log(`  ** VIDEO WRITE: [0x${addr.toString(16)}] = 0x${val.toString(16)} **`);
    }
  }
  return originalWrite(addr, val);
};

// Key addresses in the print path
const keyAddrs = {
  0x0010: 'RST-10 entry',
  0x15F2: 'PRINT-A-2 (RST10 target)',
  0x162C: 'PO-SAVE',
  0x09F4: 'PRINT-OUT',
  0x0B03: 'PO-FETCH',
  0x0B24: 'PO-CHAR',
  0x0B38: 'PO-CHAR-2',
  0x0B4C: 'PO-CHAR-3',
  0x0B52: 'PO-STORE',
  0x0B65: 'PO-ST-PR (pixel row print)',
  0x0B7F: 'PO-SCR',
  0x0B93: 'PR-ALL (main char plot)',
  0x0BA4: 'PR-ALL-1',
  0x0BB6: 'PR-ALL-2',
  0x0BC1: 'PR-ALL-3',
  0x0BD3: 'PR-ALL-4',
  0x0BDB: 'PR-ALL-5',
};

function runFrame() {
  let frameT = 0;
  
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`\nEI reached at frame ${frameCount}\n`);
    }
    
    // Start trace at first real character (not copyright symbol)
    if (opcode === 0xD7 && eiReached && !traceActive) { // RST 10
      const char = cpu.A;
      // Wait for a printable ASCII char like '1' or 'S'
      if (char >= 0x20 && char < 0x7F && char !== 0x7F) {
        traceActive = true;
        charToPrint = char;
        instrCount = 0;
        videoWriteCount = 0;
        console.log(`\n======== Tracing print of '${String.fromCharCode(char)}' (0x${char.toString(16)}) ========`);
        console.log(`  DF_CC (cursor): 0x${(memory.read(0x5C84) | (memory.read(0x5C85) << 8)).toString(16)}`);
        console.log(`  CHARS (font addr): 0x${(memory.read(0x5C36) | (memory.read(0x5C37) << 8)).toString(16)}`);
      }
    }
    
    // Trace the print path
    if (traceActive && instrCount < 300) {
      const label = keyAddrs[pc];
      if (label) {
        console.log(`  [${label}] PC=0x${pc.toString(16)}`);
      }
      
      // Log all CALLs and JPs
      if (opcode === 0xCD) { // CALL
        const target = memory.read(pc+1) | (memory.read(pc+2) << 8);
        console.log(`    CALL 0x${target.toString(16)}`);
      }
      if (opcode === 0xC3 || opcode === 0xC2 || opcode === 0xCA) { // JP, JP NZ, JP Z
        const target = memory.read(pc+1) | (memory.read(pc+2) << 8);
        console.log(`    JP 0x${target.toString(16)}`);
      }
      
      // Log RET
      if (opcode === 0xC9 && instrCount > 0) {
        console.log(`    RET (back to 0x${((memory.read(cpu.SP) | (memory.read(cpu.SP+1) << 8))).toString(16)})`);
      }
      
      instrCount++;
      
      // Stop after returning from print
      if (pc > 0x1200 && instrCount > 50) {
        console.log(`\n  Print completed. Video writes: ${videoWriteCount}`);
        traceActive = false;
      }
    }
    
    if (opcode === 0x76 && !cpu.IFF1) break;
    if (opcode === 0x76) {
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

console.log('=== Complete print path trace ===\n');

// Run frames
for (let f = 0; f < 100; f++) {
  runFrame();
  if (traceActive === false && videoWriteCount > 0) break;
}

console.log('\n=== Final check ===');
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero video bytes: ${nonZero}`);
