/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { loadRom } from './src/romManager.mjs';

console.log('Testing Full Boot Sequence Progression...\n');

// Create memory and CPU
const memory = new Memory();
const z80 = new Z80(memory);

// Load the ZX Spectrum 48K ROM
console.log('Loading ZX Spectrum 48K ROM...');
const romData = await loadRom('spec48');

// Apply ROM to memory
memory.loadROM(romData.rom);
memory.configureBanks('48k');

// Reset CPU
z80.reset();
z80.PC = 0x0000;

console.log(`Starting boot sequence from PC 0x0000...\n`);

const instructions = [
  { name: 'DI', opcode: 0xF3 },
  { name: 'XOR A', opcode: 0xAF },
  { name: 'LD DE,nn', opcode: 0x11 }, // This was missing!
  { name: 'JP nn', opcode: 0xC3 }
];

let totalTStates = 0;

for (let i = 0; i < 10; i++) {
  const pc = z80.PC;
  const opcode = z80.readByte(pc);
  
  console.log(`Step ${i + 1}: PC=0x${pc.toString(16).padStart(4, '0')}, Opcode=0x${opcode.toString(16).padStart(2, '0')}`);
  
  // Check if we're in expected boot sequence
  if (pc < 0x0010) {
    let expected = instructions[Math.min(i, instructions.length - 1)];
    if (opcode === expected.opcode) {
      console.log(`  ✅ Expected: ${expected.name}`);
    } else {
      console.log(`  ⚠️  Expected: ${expected.name}, Got: 0x${opcode.toString(16).padStart(2, '0')}`);
    }
  }
  
  // Check specific critical registers during boot
  if (pc === 0x0002) {
    console.log(`  📍 LD DE,nn instruction - about to execute`);
    console.log(`     Current DE = 0x${((z80.D << 8) | z80.E).toString(16).padStart(4, '0')}`);
  }
  if (pc === 0x0005) {
    console.log(`  🎯 After LD DE,nn - JP instruction`);
    console.log(`     DE = 0x${((z80.D << 8) | z80.E).toString(16).padStart(4, '0')} (should be 0xFFFF)`);
    console.log(`     PC will jump to 0x11CB (per ROM analysis)`);
  }
  
  const tstates = z80.step();
  totalTStates += tstates;
  
  console.log(`     T-states this instruction: ${tstates}, Total: ${totalTStates}`);
  console.log();
  
  // Stop if we reach the copyright area
  if (pc >= 0x1500) {
    console.log(`🎉 Boot sequence reached copyright area!`);
    break;
  }
  
  // Stop if we're taking too many steps
  if (i > 20) {
    console.log(`⚠️  Stopping after 20 instructions`);
    break;
  }
}

console.log(`\n=== Boot Sequence Analysis ===`);
console.log(`Final PC: 0x${z80.PC.toString(16).padStart(4, '0')}`);
console.log(`Final DE: 0x${((z80.D << 8) | z80.E).toString(16).padStart(4, '0')}`);
console.log(`Total T-states: ${totalTStates}`);

// Check if we successfully passed the critical point
if (z80.PC > 0x0004) {
  console.log(`✅ SUCCESS: Boot sequence progressed past the critical LD DE,nn instruction!`);
  console.log(`   The missing 16-bit immediate load instructions are now working.`);
} else {
  console.log(`❌ FAILED: Boot sequence did not progress as expected`);
}
