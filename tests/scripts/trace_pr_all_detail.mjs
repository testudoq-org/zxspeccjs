/**
 * Trace specifically what happens during PR-ALL (character plotting)
 * and why the system gets corrupted
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
let inPrAll = false;
let inPrintOut = false;
let instrCount = 0;

// Track writes to system variable area
const originalWrite = memory.write.bind(memory);
let sysvarWrites = [];
memory.write = function(addr, val) {
  if (addr >= 0x5C00 && addr < 0x5D00 && eiReached) {
    sysvarWrites.push({ addr, val, frame: frameCount, inPrAll, inPrintOut });
  }
  return originalWrite(addr, val);
};

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`EI reached at frame ${frameCount}`);
    }
    
    // Track routine entries/exits
    if (pc === 0x09F4) { inPrintOut = true; console.log(`Frame ${frameCount}: -> PRINT-OUT`); }
    if (pc === 0x0B93) { inPrAll = true; console.log(`Frame ${frameCount}: -> PR-ALL (char plot)`); }
    
    // Track RET from print routines
    if (opcode === 0xC9 && (inPrAll || inPrintOut)) {
      const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
      if (retAddr > 0x1000) {
        console.log(`Frame ${frameCount}: RET from print to 0x${retAddr.toString(16)}`);
        inPrAll = false;
        inPrintOut = false;
      }
    }
    
    // Trace first print in detail
    if (inPrAll && instrCount < 200) {
      // Watch for video memory writes
      if (opcode === 0x77) { // LD (HL),A
        const hl = cpu._getHL();
        if (hl >= 0x4000 && hl < 0x5B00) {
          console.log(`  VIDEO: [0x${hl.toString(16)}] <- 0x${cpu.A.toString(16)}`);
        }
      }
      instrCount++;
    }
    
    // Check for RST 08 (error)
    if (opcode === 0xCF) {
      console.log(`*** RST 08 ERROR at PC=0x${pc.toString(16)} ***`);
      return;
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

console.log('=== Detailed PR-ALL trace ===\n');

for (let f = 0; f < 95; f++) {
  runFrame();
}

console.log('\n=== System variable writes ===');
// Show writes to key variables
const keyVars = {
  0x5CB2: 'RAMTOP_LO',
  0x5CB3: 'RAMTOP_HI',
  0x5C3A: 'ERR_NR',
  0x5C3B: 'FLAGS',
  0x5C3C: 'TV_FLAG',
};

for (const write of sysvarWrites) {
  const varName = keyVars[write.addr] || '';
  if (varName) {
    console.log(`  [0x${write.addr.toString(16)}] ${varName} = 0x${write.val.toString(16)} (frame ${write.frame})`);
  }
}

console.log('\n=== Final state ===');
const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
console.log(`RAMTOP: 0x${ramtop.toString(16)}`);
console.log(`PC: 0x${cpu.PC.toString(16)}, SP: 0x${cpu.SP.toString(16)}`);

let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero video bytes: ${nonZero}`);
