/**
 * Trace full RST 10 path through ROM to understand the flow
 */

import fs from 'fs';
import { Z80 } from './src/z80.mjs';

console.log('='.repeat(70));
console.log('TRACE RST 10 FULL PATH');
console.log('='.repeat(70));

// Load ROM
const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Uint8Array(65536);
memory.set(romData, 0);

// Initialize system variables as boot ROM does
// CHARS - character set address minus 256
memory[0x5C36] = 0x00;
memory[0x5C37] = 0x3C;  // CHARS = 0x3C00 (char set at 0x3D00 - 0x100)

// DF_CC - display file current column pointer
memory[0x5C84] = 0x00;
memory[0x5C85] = 0x50;  // DF_CC = 0x5000 (middle of screen)

// S_POSN - screen position (column, line) - counted from bottom right!
memory[0x5C88] = 21;     // column (33 = left edge, 1 = right edge)
memory[0x5C89] = 23;     // line (24 = top, 1 = bottom)

// ATTR_P - permanent attributes
memory[0x5C8D] = 0x38;   // white paper, black ink

// P_FLAG - print flags
memory[0x5C91] = 0x00;

// DF_SZ - display size
memory[0x5C6B] = 2;      // 2 lines for input area

// ATTR_T - temporary attributes
memory[0x5C8F] = 0x38;

// MASK_T
memory[0x5C90] = 0x00;

// TV_FLAG
memory[0x5C3A] = 0x00;

// Set up channel info
// CHANS points to channel data
memory[0x5C4F] = 0xB6;
memory[0x5C50] = 0x5C;   // CHANS = 0x5CB6

// Channel 'S' output routine at 0x09F4 (PRINT-OUT)  
memory[0x5CB6] = 0xF4;
memory[0x5CB7] = 0x09;
// Input routine
memory[0x5CB8] = 0x10;
memory[0x5CB9] = 0x11;
// Channel letter
memory[0x5CBA] = 'S'.charCodeAt(0);

// CURCHL - current channel
memory[0x5C51] = 0xB6;
memory[0x5C52] = 0x5C;   // points to channel S

// IY register should point to ERR_NR (0x5C3A)
// (Actually the Spectrum uses IY = 0x5C3A throughout the ROM)

const memoryInterface = {
  read: (addr) => memory[addr & 0xFFFF],
  write: (addr, val) => {
    if (addr >= 0x4000) memory[addr & 0xFFFF] = val;
  }
};

const ioInterface = {
  read: (port) => 0xFF,
  write: (port, val) => {}
};

const cpu = new Z80(memoryInterface, ioInterface);
cpu.reset();

// Set up CPU state
cpu.A = 0x41;  // Character 'A'
cpu.IY = 0x5C3A;  // ERR_NR - this is critical for ROM routines!
cpu.SP = 0xFF00;
cpu.PC = 0x0010;  // RST 10 entry point

console.log('\nInitial state:');
console.log(`  PC = 0x${cpu.PC.toString(16).padStart(4, '0')} (RST 10 = PRINT-A)`);
console.log(`  A  = 0x${cpu.A.toString(16).padStart(2, '0')} ('${String.fromCharCode(cpu.A)}')`);
console.log(`  IY = 0x${cpu.IY.toString(16).padStart(4, '0')}`);
console.log(`  DF_CC = 0x${(memory[0x5C84] | (memory[0x5C85] << 8)).toString(16).padStart(4, '0')}`);

// Track important events
const MAX_STEPS = 1000;
let screenWrites = [];
const routineNames = {
  0x0010: 'PRINT-A (RST 10)',
  0x09F4: 'PRINT-OUT',
  0x0ADC: 'PO-STORE',
  0x0B03: 'PO-SCR (fetch screen pos)',
  0x0B24: 'PO-CHAR',
  0x0B38: 'PO-FETCH',
  0x0B4D: 'PO-ANY',
  0x0B65: 'PO-GR-1',
  0x0B7F: 'PO-T&UDG',
  0x0B93: 'PR-ALL (plot character)',
  0x0BD3: 'PO-ABLE',
  0x0BDB: 'PO-STORE2',
  0x15F2: 'CHAN-K/S output',
  0x162C: 'CO-TEMP-5 (JP (HL))',
};

console.log('\n--- Execution trace ---\n');

for (let i = 0; i < MAX_STEPS; i++) {
  const pc = cpu.PC;
  const opcode = memory[pc];
  
  // Track display file writes
  const prevDF = new Uint8Array(memory.slice(0x4000, 0x5800));
  
  const consumed = cpu.step();
  
  // Check for writes
  for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory[addr] !== prevDF[addr - 0x4000] && memory[addr] !== 0) {
      screenWrites.push({ addr, val: memory[addr], step: i, pc });
    }
  }
  
  // Log routine entries
  const routine = routineNames[pc];
  if (routine) {
    const hl = (cpu.H << 8) | cpu.L;
    const de = (cpu.D << 8) | cpu.E;
    const bc = (cpu.B << 8) | cpu.C;
    console.log(`[${i.toString().padStart(4)}] ${routine} @ 0x${pc.toString(16).padStart(4, '0')}`);
    console.log(`       A=${cpu.A.toString(16).padStart(2, '0')} HL=${hl.toString(16).padStart(4, '0')} DE=${de.toString(16).padStart(4, '0')} BC=${bc.toString(16).padStart(4, '0')}`);
  }
  
  // Stop on RET when back at our stack level
  if (opcode === 0xC9 && cpu.SP >= 0xFF00) {
    console.log(`\n[${i}] RET - returning from RST 10`);
    break;
  }
  
  // Safety check
  if (pc >= 0x8000 && pc < 0xC000) {
    console.log(`\n[${i}] ERROR: PC in RAM area 0x${pc.toString(16)}`);
    break;
  }
}

console.log(`\n--- RESULTS ---`);
console.log(`Screen writes: ${screenWrites.length}`);
if (screenWrites.length > 0) {
  console.log('Writes:');
  screenWrites.forEach(w => {
    console.log(`  [0x${w.addr.toString(16)}] = 0x${w.val.toString(16).padStart(2, '0')} at step ${w.step}`);
  });
}

// Check final video memory
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory[addr] !== 0) nonZero++;
}
console.log(`\nVideo memory non-zero bytes: ${nonZero}`);
