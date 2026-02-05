// Trace execution to understand where we get stuck
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const memory = new Memory();
const cpu = new Z80(memory);

memory.loadROM(rom.bytes);
cpu.reset();

// Track unique PC values in ranges
const pcRanges = {};
const pcCounts = {};

console.log('=== Running 200000 instructions ===');

for (let i = 0; i < 200000; i++) {
  const pc = cpu.PC;
  
  // Count PC occurrences
  pcCounts[pc] = (pcCounts[pc] || 0) + 1;
  
  // Track by range
  const range = Math.floor(pc / 0x100) * 0x100;
  pcRanges[range] = (pcRanges[range] || 0) + 1;
  
  cpu.step();
}

console.log('\n=== Most common PC addresses ===');
const sorted = Object.entries(pcCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [pc, count] of sorted) {
  const addr = parseInt(pc);
  const opcode = memory.read(addr);
  console.log(`PC=0x${addr.toString(16).padStart(4,'0')} opcode=0x${opcode.toString(16).padStart(2,'0')} count=${count}`);
}

console.log('\n=== Execution by memory range ===');
const rangesSorted = Object.entries(pcRanges).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [range, count] of rangesSorted) {
  console.log(`0x${parseInt(range).toString(16).padStart(4,'0')}-0x${(parseInt(range)+0xFF).toString(16).padStart(4,'0')}: ${count} instructions`);
}

// Now check what the loop at 0x11DC looks like
console.log('\n=== Checking memory fill loop ===');
console.log('At 0x11DC, H should be compared with A (0x3F)');
console.log('Loop exits when H == A');
console.log('But wait - A was set to 0x3F at 0x11D0, but what is H initially?');

// Restart and check
const cpu2 = new Z80(memory);
cpu2.reset();

// Run through the initial instructions
for (let i = 0; i < 10; i++) {
  const pc = cpu2.PC;
  const opcode = memory.read(pc);
  const HL = (cpu2.H << 8) | cpu2.L;
  console.log(`PC=0x${pc.toString(16).padStart(4,'0')} op=0x${opcode.toString(16).padStart(2,'0')} A=0x${cpu2.A.toString(16).padStart(2,'0')} H=0x${cpu2.H.toString(16).padStart(2,'0')} HL=0x${HL.toString(16).padStart(4,'0')}`);
  cpu2.step();
}

console.log('\nAfter first 10 instructions:');
const HL2 = (cpu2.H << 8) | cpu2.L;
console.log(`A=0x${cpu2.A.toString(16).padStart(2,'0')} H=0x${cpu2.H.toString(16).padStart(2,'0')} HL=0x${HL2.toString(16).padStart(4,'0')}`);
console.log('The fill loop should exit when H reaches 0x3F');
console.log(`H starts at 0xFF, needs to count down to 0x3F = ${0xFF - 0x3F} decrements`);
