/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace the actual LDIR that copies character data to video RAM
 * The PR-ALL routine at 0x0B93 does the actual character plotting
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
let traceChar = false;
let printCount = 0;

// Watch for specific opcodes
const opcodeNames = {
  0xED: 'ED prefix',
  0xCD: 'CALL',
  0xC9: 'RET',
  0x77: 'LD (HL),A',
  0x36: 'LD (HL),n',
  0x32: 'LD (nn),A',
  0x22: 'LD (nn),HL',
};

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
    }
    
    // Start tracing at RST 10 for printable char
    if (opcode === 0xD7 && eiReached && printCount < 3) {
      const char = cpu.A;
      if (char === 0x31) { // '1' character
        printCount++;
        traceChar = true;
        console.log(`\n==== RST 10 for '1' (#${printCount}) ====`);
        console.log(`CHARS: 0x${(memory.read(0x5C36) | (memory.read(0x5C37) << 8)).toString(16)}`);
        // Font for '1' is at CHARS + 256 + 0x31*8 = 0x3D00 + 0x31*8 = 0x3D00 + 0x188 = 0x3E88
        const fontAddr = 0x3D00 + 0x31 * 8;
        console.log(`Font '1' at 0x${fontAddr.toString(16)}:`);
        for (let i = 0; i < 8; i++) {
          const byte = memory.read(fontAddr + i);
          console.log(`  0x${(fontAddr+i).toString(16)}: ${byte.toString(2).padStart(8,'0')}`);
        }
      }
    }
    
    // Trace all memory writes during character printing
    if (traceChar && opcode === 0x77) { // LD (HL),A
      const hl = cpu._getHL();
      console.log(`  LD (HL),A: [0x${hl.toString(16)}] <- 0x${cpu.A.toString(16)}`);
    }
    
    // Watch for LDIR (ED B0) - used to copy character data
    if (traceChar && opcode === 0xED) {
      const op2 = memory.read(pc + 1);
      if (op2 === 0xB0) { // LDIR
        console.log(`  LDIR: HL=0x${cpu._getHL().toString(16)}, DE=0x${cpu._getDE().toString(16)}, BC=${cpu._getBC()}`);
      }
    }
    
    // Track key routine entries
    if (traceChar) {
      if (pc === 0x0B93) console.log('  --> PR-ALL (character plot)');
      if (pc === 0x0B24) console.log('  --> PO-CHAR');
      if (pc === 0x0B65) console.log('  --> PO-ST-PR');
      if (pc === 0x09F4) console.log('  --> PRINT-OUT');
    }
    
    // Stop tracing after return
    if (traceChar && pc > 0x1200 && frameT > 100) {
      console.log('  Print routine returned');
      traceChar = false;
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

console.log('=== Character Plot Trace ===\n');
console.log('Looking for PR-ALL (0x0B93) which does actual pixel plotting\n');

for (let f = 0; f < 100; f++) {
  runFrame();
}

console.log('\n=== Video Memory Check ===');
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero pixels: ${nonZero}`);

// Check first line of video memory
console.log('\nFirst 32 bytes of video memory:');
for (let i = 0; i < 32; i++) {
  const val = memory.read(0x4000 + i);
  if (val !== 0) console.log(`  0x${(0x4000+i).toString(16)}: 0x${val.toString(16)}`);
}

