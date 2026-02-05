/**
 * Trace boot after RST 10 fix to see what's happening
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
let errorDetected = false;

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`\nEI reached at frame ${frameCount}`);
      const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
      console.log(`  RAMTOP: 0x${ramtop.toString(16)}, SP: 0x${cpu.SP.toString(16)}\n`);
    }
    
    // Track important events
    if (eiReached && frameCount < 95) {
      // RST 10 (print)
      if (opcode === 0xD7) {
        console.log(`Frame ${frameCount}: RST 10 at PC=0x${pc.toString(16)}, A=0x${cpu.A.toString(16)} '${cpu.A >= 32 && cpu.A < 127 ? String.fromCharCode(cpu.A) : '?'}' SP=0x${cpu.SP.toString(16)}`);
      }
      
      // RST 08 (error)
      if (opcode === 0xCF) {
        const errCode = memory.read(pc + 1);
        console.log(`Frame ${frameCount}: *** RST 08 ERROR at PC=0x${pc.toString(16)}, Error code: ${errCode} ***`);
        errorDetected = true;
      }
      
      // Key routine entries
      if (pc === 0x09F4) console.log(`Frame ${frameCount}: PRINT-OUT at 0x09F4`);
      if (pc === 0x0B93) console.log(`Frame ${frameCount}: PR-ALL (char plot) at 0x0B93`);
      if (pc === 0x0D6B) console.log(`Frame ${frameCount}: CLS at 0x0D6B`);
      if (pc === 0x0DAF) console.log(`Frame ${frameCount}: CL-ALL at 0x0DAF`);
      if (pc === 0x15E1) console.log(`Frame ${frameCount}: MAIN-WAIT (keyboard loop)`);
    }
    
    if (opcode === 0x76 && !cpu.IFF1) break;
    if (opcode === 0x76) { frameT = FRAME_TSTATES; break; }
    
    const tsBefore = cpu.tstates;
    cpu.step();
    frameT += (cpu.tstates - tsBefore);
    
    if (errorDetected) return;
  }
  
  cpu.intRequested = false;
  frameCount++;
}

console.log('=== Boot trace after RST 10 fix ===\n');

for (let f = 0; f < 100; f++) {
  runFrame();
  if (errorDetected) break;
}

console.log('\n=== Final state ===');
console.log(`Frames: ${frameCount}`);
console.log(`PC: 0x${cpu.PC.toString(16)}, SP: 0x${cpu.SP.toString(16)}`);
const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
console.log(`RAMTOP: 0x${ramtop.toString(16)}`);

let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero video bytes: ${nonZero}`);
