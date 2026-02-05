/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

/**
 * Run boot sequence until it reaches EI or error
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k' });
memory.loadROM(romData);
const cpu = new Z80(memory);
memory.attachCPU(cpu);
cpu.reset();

// Run until EI or RST 08
const maxInstructions = 2000000; // 2 million should be enough
let count = 0;
let lastHL = 0;
let eiFound = false;

console.log('Running boot sequence (waiting for EI or RST 08)...');
const startTime = Date.now();

while (count < maxInstructions) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  
  // Check for EI (0xFB)
  if (opcode === 0xFB) {
    console.log(`\n*** EI found at PC=0x${pc.toString(16).padStart(4, '0')} after ${count} instructions!`);
    console.log(`    SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
    console.log(`    HL: 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
    eiFound = true;
    break;
  }
  
  // Check for RST 08 (error)
  if (opcode === 0xCF) {
    console.log(`\n*** RST 08 (error) at PC=0x${pc.toString(16).padStart(4, '0')} after ${count} instructions!`);
    console.log(`    SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
    console.log(`    A: 0x${cpu.A.toString(16).padStart(2, '0')}`);
    break;
  }
  
  // Progress indicator
  if (count % 200000 === 0) {
    const hl = (cpu.H << 8) | cpu.L;
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[${count}] PC=0x${pc.toString(16).padStart(4,'0')} HL=0x${hl.toString(16).padStart(4,'0')} SP=0x${cpu.SP.toString(16).padStart(4,'0')} (${elapsed.toFixed(1)}s)`);
  }
  
  cpu.step();
  count++;
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`\nCompleted in ${elapsed.toFixed(1)} seconds`);
console.log(`Total instructions: ${count}`);

// Final state
console.log('\nFinal state:');
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  IFF1: ${cpu.IFF1}`);

// System variables
const RAMTOP_ADDR = 0x5CB2;
const ramtop = memory.read(RAMTOP_ADDR) | (memory.read(RAMTOP_ADDR + 1) << 8);
console.log(`  RAMTOP (0x5CB2): 0x${ramtop.toString(16).padStart(4, '0')}`);

// If EI was found, continue a bit more to see what happens
if (eiFound) {
  console.log('\nContinuing execution after EI...');
  for (let i = 0; i < 100; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    console.log(`  [${i}] PC=0x${pc.toString(16).padStart(4,'0')} Op=0x${opcode.toString(16).padStart(2,'0')}`);
    
    if (opcode === 0xCF) {
      console.log('  *** RST 08 (error) ***');
      break;
    }
    
    cpu.step();
  }
}

