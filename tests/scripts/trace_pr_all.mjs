/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace PR-ALL Character Plotting 
 * 
 * The copyright is sent via RST 10, reaches PR-ALL (0x0B93)
 * but pixels don't appear. Let's trace exactly what PR-ALL does.
 */

import fs from 'fs';
import { Z80 } from './src/z80.mjs';

console.log('='.repeat(70));
console.log('TRACE PR-ALL CHARACTER PLOTTING');
console.log('='.repeat(70));

// Load ROM
const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Uint8Array(65536);
memory.set(romData, 0);

// Pre-initialize system variables like the boot does
// DF_CC - display file current column
memory[0x5C84] = 0x00;
memory[0x5C85] = 0x40;  // DF_CC = 0x4000 (start of display)
// S_POSN - screen position
memory[0x5C88] = 33;     // column
memory[0x5C89] = 24;     // line
// ATTR_P - permanent attributes
memory[0x5C8D] = 0x38;   // white paper, black ink
// P_FLAG
memory[0x5C91] = 0;

// Set up channel info at 0x5CB6 (where CHANS points after init)
// Channel output routine for 'S' (screen) = 0x09F4 (PRINT-OUT)
memory[0x5CB6] = 0xF4;  // low byte
memory[0x5CB7] = 0x09;  // high byte
// Input routine
memory[0x5CB8] = 0x10;  // low byte  
memory[0x5CB9] = 0x11;  // high byte (KEY-INPUT at 0x1110)

// CURCHL points to channel info
memory[0x5C51] = 0xB6;
memory[0x5C52] = 0x5C;

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

// Set up for printing character 'A' (0x41) which has code 0x26 in Spectrum
// Spectrum uses codes 0x20-0x7F for printable characters
// ASCII 'A' (65) - 32 = 33, but let's use ROM character code directly

// Set A = character to print ('©' or test with 'A')
cpu.A = 0x41;  // ASCII 'A' = 65

// Set up stack in safe area
cpu.SP = 0xFF00;

// Set PC to PR-ALL (0x0B93)
cpu.PC = 0x0B93;

console.log('\nInitial state:');
console.log(`  PC = 0x${cpu.PC.toString(16).padStart(4, '0')} (PR-ALL)`);
console.log(`  A  = 0x${cpu.A.toString(16).padStart(2, '0')} (character '${String.fromCharCode(cpu.A)}')`);
console.log(`  SP = 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  DF_CC = 0x${(memory[0x5C84] | (memory[0x5C85] << 8)).toString(16).padStart(4, '0')}`);

// Key ROM addresses to watch
const watchAddrs = {
  0x0B93: 'PR-ALL start',
  0x0B94: 'PR-ALL+1',
  0x0BB7: 'EX AF,AF\'',
  0x0BB8: 'after EX AF,AF\'',
  0x0BBE: 'PO-CHAR',
  0x0BC1: 'after PO-CHAR tests',
  0x0BD3: 'PO-ABLE',
  0x0BD5: 'after LD BC,(CHARS)',
  0x0BDB: 'ADD HL,BC (char bitmap addr)',
  0x0BDC: 'POP BC (screen addr)',
  0x0BDE: 'after POP BC',
  0x0BDF: 'before write loop'
};

console.log('\n--- Tracing PR-ALL execution ---\n');

const MAX_STEPS = 500;
let pixelWriteCount = 0;
let screenWrites = [];

for (let i = 0; i < MAX_STEPS; i++) {
  const pc = cpu.PC;
  const opcode = memory[pc];
  const sp = cpu.SP;
  
  // Check if we're at a watched address
  const label = watchAddrs[pc];
  
  // Format: [step] PC: opcode (mnemonic) | registers
  let line = `[${i.toString().padStart(3)}] `;
  line += `0x${pc.toString(16).padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} `;
  
  // Add label if known
  if (label) {
    line += `<${label}> `;
  }
  
  // Key register info
  line += `| A=${cpu.A.toString(16).padStart(2, '0')} `;
  line += `HL=${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')} `;
  line += `BC=${((cpu.B << 8) | cpu.C).toString(16).padStart(4, '0')} `;
  line += `DE=${((cpu.D << 8) | cpu.E).toString(16).padStart(4, '0')} `;
  
  // Track writes to display memory
  const prevDisplay = new Uint8Array(memory.slice(0x4000, 0x4100));
  
  // Execute
  const consumed = cpu.step();
  
  // Check for display writes
  for (let addr = 0x4000; addr < 0x4100; addr++) {
    if (memory[addr] !== prevDisplay[addr - 0x4000] && memory[addr] !== 0) {
      pixelWriteCount++;
      screenWrites.push({ addr, val: memory[addr], step: i });
      line += `WRITE: [0x${addr.toString(16)}] = 0x${memory[addr].toString(16).padStart(2, '0')} `;
    }
  }
  
  console.log(line);
  
  // Stop conditions
  if (opcode === 0xC9 && sp >= 0xFF00) {
    console.log('\n--- RET to original caller - PR-ALL complete ---');
    break;
  }
  
  if (opcode === 0x76) {
    console.log('\n--- HALT reached ---');
    break;
  }
  
  // Safety: if PC goes into uninitialized RAM
  if (pc >= 0xA000 && pc < 0xC000 && memory[pc] === 0) {
    console.log(`\n--- ERROR: Jumped to uninitialized RAM at 0x${pc.toString(16)} ---`);
    break;
  }
  
  // Safety: infinite loop detection
  if (consumed <= 0) {
    cpu.PC++;
  }
}

console.log(`\n--- RESULTS ---`);
console.log(`  Screen writes: ${pixelWriteCount}`);
if (screenWrites.length > 0) {
  console.log('  Write addresses:');
  screenWrites.slice(0, 10).forEach(w => {
    console.log(`    Step ${w.step}: [0x${w.addr.toString(16)}] = 0x${w.val.toString(16).padStart(2, '0')}`);
  });
}

// Check video memory
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory[addr] !== 0) nonZero++;
}
console.log(`  Video memory non-zero bytes: ${nonZero}`);

// Check DF_CC position after
const dfcc = memory[0x5C84] | (memory[0x5C85] << 8);
console.log(`  DF_CC after: 0x${dfcc.toString(16).padStart(4, '0')}`);

