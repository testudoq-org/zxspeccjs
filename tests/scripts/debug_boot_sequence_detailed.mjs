#!/usr/bin/env node

/**
 * Debug the boot sequence to understand why system variables aren't being set
 */

import spec48 from './src/roms/spec48.js';
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

const rom = spec48.bytes;

// Create memory and CPU
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

console.log('=== Debugging Boot Sequence ===\n');

cpu.reset();

// Track key system variable addresses
const sysVars = {
  0x5C36: 'CHARS (char set ptr - 256)',
  0x5C38: 'RASP',
  0x5C3A: 'PIP',
  0x5C3B: 'ERR_NR',
  0x5C5C: 'FRAMES (lo)',
  0x5C5D: 'FRAMES (mid)',
  0x5C5E: 'FRAMES (hi)',
  0x5C78: 'FRAMES2 (lo)',  // Alternate location some docs use
};

// Run for some T-states and track PC
const milestones = [
  { tstates: 10000, desc: 'Early boot' },
  { tstates: 100000, desc: 'Memory test' },
  { tstates: 500000, desc: 'Screen init' },
  { tstates: 1000000, desc: 'Channel setup' },
  { tstates: 2000000, desc: 'BASIC init' },
  { tstates: 5000000, desc: 'Boot complete' },
];

let totalTstates = 0;
let milestoneIdx = 0;
let interruptCount = 0;

// Enable interrupts after ROM enables them (EI instruction)
// The EI instruction is at various points in the ROM
let interruptsEnabled = false;

// Track the HALT instruction
let haltCount = 0;
let lastPC = 0;
let stuckCount = 0;

// Run the boot sequence
console.log('Starting boot sequence from PC=0x0000...\n');

while (totalTstates < 5000000) {
  const pc = cpu.PC;
  
  // Check if we're stuck in a loop
  if (pc === lastPC) {
    stuckCount++;
    if (stuckCount > 100000) {
      console.log(`\n⚠️ CPU appears stuck at PC=0x${pc.toString(16).padStart(4,'0')}`);
      break;
    }
  } else {
    stuckCount = 0;
    lastPC = pc;
  }
  
  // Track EI instruction (0xFB)
  const opcode = memory.read(pc);
  if (opcode === 0xFB && !interruptsEnabled) {
    console.log(`\n🔧 EI instruction at PC=0x${pc.toString(16).padStart(4,'0')} - Interrupts enabled`);
    interruptsEnabled = true;
  }
  
  // Track HALT instruction (0x76)
  if (opcode === 0x76) {
    haltCount++;
    if (haltCount <= 5) {
      console.log(`🛑 HALT instruction at PC=0x${pc.toString(16).padStart(4,'0')} (count: ${haltCount})`);
    }
    // Simulate interrupt to get out of HALT
    if (interruptsEnabled && cpu.IFF1) {
      cpu.halted = false;
      cpu.intRequested = true;
      interruptCount++;
    }
  }
  
  const cycles = cpu.step();
  totalTstates += cycles;
  
  // Generate interrupt every ~70000 T-states (50Hz frame)
  if (interruptsEnabled && cpu.IFF1 && !cpu.halted) {
    // Check if we should generate an interrupt (every frame)
    const frameNum = Math.floor(totalTstates / 69888);
    const prevFrameNum = Math.floor((totalTstates - cycles) / 69888);
    if (frameNum > prevFrameNum) {
      cpu.intRequested = true;
      interruptCount++;
    }
  }
  
  // Report at milestones
  if (milestoneIdx < milestones.length && totalTstates >= milestones[milestoneIdx].tstates) {
    const m = milestones[milestoneIdx];
    console.log(`\n📍 Milestone: ${m.desc} (${totalTstates} T-states)`);
    console.log(`   PC: 0x${cpu.PC.toString(16).padStart(4,'0')}`);
    console.log(`   IFF1: ${cpu.IFF1}, IFF2: ${cpu.IFF2}, IM: ${cpu.IM}`);
    console.log(`   Interrupts generated: ${interruptCount}`);
    
    // Check some system variables
    const chars = memory.read(0x5C36) | (memory.read(0x5C37) << 8);
    const frames = memory.read(0x5C78) | (memory.read(0x5C79) << 8) | (memory.read(0x5C7A) << 16);
    console.log(`   CHARS: 0x${chars.toString(16).padStart(4,'0')}`);
    console.log(`   FRAMES: ${frames}`);
    
    milestoneIdx++;
  }
}

console.log('\n=== Final State ===');
console.log(`Total T-states: ${totalTstates}`);
console.log(`Final PC: 0x${cpu.PC.toString(16).padStart(4,'0')}`);
console.log(`Interrupts generated: ${interruptCount}`);
console.log(`HALT count: ${haltCount}`);

// Check system variables
console.log('\n=== System Variables ===');
for (const [addr, name] of Object.entries(sysVars)) {
  const val = memory.read(parseInt(addr));
  console.log(`   0x${parseInt(addr).toString(16)}: 0x${val.toString(16).padStart(2,'0')} - ${name}`);
}

// Check CHARS in detail
const charsLo = memory.read(0x5C36);
const charsHi = memory.read(0x5C37);
const charsPtr = (charsHi << 8) | charsLo;
console.log(`\nCHARS pointer: 0x${charsPtr.toString(16).padStart(4,'0')}`);
console.log(`Expected: 0x3C00 (points to character set at 0x3D00 minus 256)`);

// Check what's in display memory
console.log('\n=== Display Memory Check ===');
let nonZeroPixels = 0;
let nonDefaultAttrs = 0;
for (let i = 0; i < 0x1800; i++) {
  if (memory.read(0x4000 + i) !== 0) nonZeroPixels++;
}
for (let i = 0; i < 768; i++) {
  const attr = memory.read(0x5800 + i);
  if (attr !== 0x38 && attr !== 0x00) nonDefaultAttrs++;
}
console.log(`Bitmap bytes with content: ${nonZeroPixels} / 6144`);
console.log(`Attributes with non-default values: ${nonDefaultAttrs} / 768`);
