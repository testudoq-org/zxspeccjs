/**
 * Detailed boot trace to find why copyright message isn't displayed
 */
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import spec48 from './src/roms/spec48.js';

const FRAME_TSTATES = 69888;
const rom = new Uint8Array(spec48.bytes);
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

// Track key ROM routines
const keyRoutines = {
  0x0D6B: 'CLS (Clear Screen)',
  0x10: 'RST 10 (Print A)',
  0x0015: 'PRINT-A-1',
  0x09F4: 'PRINT-OUT',
  0x0B24: 'PO-CHAR',
  0x15E1: 'MAIN-WAIT (Keyboard scan loop)',
  0x15E6: 'MAIN-EXEC',
  0x0F2C: 'CL-SC-ALL (Clear screen)',
  0x0DAF: 'CL-ALL (Init screen)',
  0x0EDF: 'CL-LINE',
  0x0D4D: 'CL-CHAN (Init I/O channels)',
  0x1219: 'RAM-DONE (RAM check complete)',
  0x1222: 'NEW (Cold start)',
  0x1234: 'EI location',
  0x1266: 'After EI routine',
  0x0038: 'IM1 Interrupt handler',
};

let frameCount = 0;
let frameT = 0;
let eiReached = false;
let visitedRoutines = new Set();
let rstCalls = { 0x08: 0, 0x10: 0, 0x18: 0, 0x20: 0, 0x28: 0, 0x30: 0, 0x38: 0 };
let printedChars = [];

// Hook RST 10 to capture printed characters
let originalPC = 0;
let lastPrintA = 0;

function runFrame() {
  frameT = 0;
  
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Track EI
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`\n=== EI reached at frame ${frameCount}, PC=0x${pc.toString(16)} ===\n`);
    }
    
    // Track key routines (only report once)
    if (keyRoutines[pc] && !visitedRoutines.has(pc)) {
      visitedRoutines.add(pc);
      console.log(`Frame ${frameCount}: Entered ${keyRoutines[pc]} at 0x${pc.toString(16)}`);
    }
    
    // Track RST calls
    if (opcode >= 0xC7 && opcode <= 0xFF && (opcode & 0x07) === 0x07) {
      const rstAddr = opcode & 0x38;
      rstCalls[rstAddr] = (rstCalls[rstAddr] || 0) + 1;
      
      // For RST 10 (print), capture the character in A
      if (rstAddr === 0x10) {
        const char = cpu.A;
        printedChars.push({ frame: frameCount, char, ascii: String.fromCharCode(char) });
        if (printedChars.length <= 50) {
          console.log(`  RST 10 print: A=0x${char.toString(16)} '${char >= 32 && char < 127 ? String.fromCharCode(char) : '?'}'`);
        }
      }
    }
    
    // Track CALL 0x0D6B (CLS)
    if (opcode === 0xCD) { // CALL nn
      const callAddr = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
      if (callAddr === 0x0D6B && !visitedRoutines.has(0x0D6B)) {
        console.log(`Frame ${frameCount}: CALL CLS at 0x${callAddr.toString(16)}`);
      }
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

console.log('=== Boot trace to find copyright message ===\n');

// Run 150 frames (about 3 seconds)
const MAX_FRAMES = 150;

for (let f = 0; f < MAX_FRAMES; f++) {
  runFrame();
  
  if (f % 50 === 0) {
    console.log(`\n--- Frame ${f} status: PC=0x${cpu.PC.toString(16)}, IFF1=${cpu.IFF1} ---\n`);
  }
}

console.log('\n=== Summary ===');
console.log('RST calls:');
for (const [addr, count] of Object.entries(rstCalls)) {
  if (count > 0) {
    console.log(`  RST ${parseInt(addr).toString(16)}h: ${count} times`);
  }
}

console.log('\nVisited key routines:');
for (const pc of [...visitedRoutines].sort((a, b) => a - b)) {
  console.log(`  0x${pc.toString(16)}: ${keyRoutines[pc] || 'unknown'}`);
}

console.log(`\nPrinted characters: ${printedChars.length}`);
if (printedChars.length > 0 && printedChars.length <= 100) {
  const text = printedChars.map(p => p.char >= 32 && p.char < 127 ? String.fromCharCode(p.char) : '?').join('');
  console.log(`  Text: "${text}"`);
}

// Check video memory
let nonZeroPixels = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0x00) nonZeroPixels++;
}
console.log(`\nVideo memory: ${nonZeroPixels} non-zero bytes`);

// Check system vars
const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
const dfSz = memory.read(0x5C6B);  // DF_SZ - lines in lower screen
const scrlCt = memory.read(0x5C8C); // SCR_CT - scroll counter
console.log(`\nSystem variables:`);
console.log(`  RAMTOP: 0x${ramtop.toString(16)}`);
console.log(`  DF_SZ (lower screen lines): ${dfSz}`);
console.log(`  SCR_CT (scroll counter): ${scrlCt}`);

// Check if screen channel is set up
const tvFlag = memory.read(0x5C3C);
const flags2 = memory.read(0x5C6A);
console.log(`  TV_FLAG: 0x${tvFlag.toString(16)}`);
console.log(`  FLAGS2: 0x${flags2.toString(16)}`);
