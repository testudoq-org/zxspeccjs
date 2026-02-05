/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Comprehensive Memory and Boot Debug
 * This traces the ZX Spectrum 48K boot to understand:
 * 1. How SP is initialized by ROM
 * 2. When stack operations start failing
 * 3. Why RAMTOP might be wrong
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(80));
console.log('COMPREHENSIVE MEMORY AND BOOT DEBUG');
console.log('='.repeat(80));

// Load ROM
const romPath = path.join(__dirname, 'roms', 'spec48.rom');
const romData = fs.readFileSync(romPath);
console.log(`\nROM loaded: ${romPath} (${romData.length} bytes)`);

// Initialize memory and CPU
const memory = new Memory({ model: '48k' });
memory.loadROM(romData);
const cpu = new Z80(memory);
memory.attachCPU(cpu);
cpu.reset();

console.log('\nInitial CPU state:');
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);

// Verify ROM is readable
console.log('\nVerifying ROM at 0x0000:');
const byte0 = memory.read(0x0000);
const byte1 = memory.read(0x0001);
const byte2 = memory.read(0x0002);
console.log(`  0x0000: ${byte0.toString(16).padStart(2, '0')} (expected F3 = DI)`);
console.log(`  0x0001: ${byte1.toString(16).padStart(2, '0')} (expected AF = XOR A)`);
console.log(`  0x0002: ${byte2.toString(16).padStart(2, '0')} (expected 11 = LD DE,nn)`);

// Track SP changes
let lastSP = cpu.SP;
const spChanges = [];

// Track CALL/RET
const callStack = [];

// Track system variables (RAMTOP is at 0x5CB2-0x5CB3)
const RAMTOP_ADDR = 0x5CB2;

// Execute instructions and trace
const maxInstructions = 50000;
let instructions = 0;
const executionLog = [];

// Key milestones
const milestones = {
  '0x0000': 'START (DI)',
  '0x11CB': 'START routine',
  '0x1219': 'RAM-SET routine',
  '0x12A2': 'Initial stack setup',
  '0x0008': 'RST 08 (Error)',
  '0x1234': 'EI location',
};

console.log('\nTracing execution...');

// Track when SP is written
const originalStep = cpu.step.bind(cpu);

while (instructions < maxInstructions) {
  const pc = cpu.PC;
  const sp = cpu.SP;
  const opcode = memory.read(pc);
  
  // Log SP changes
  if (sp !== lastSP) {
    spChanges.push({
      instruction: instructions,
      pc: lastPC,
      oldSP: lastSP,
      newSP: sp,
      opcode: lastOpcode
    });
    
    // Check if SP is now in ROM area
    if (sp < 0x4000 && lastSP >= 0x4000) {
      console.log(`\n*** WARNING: SP moved into ROM area at instruction ${instructions}!`);
      console.log(`    PC: 0x${lastPC.toString(16).padStart(4, '0')}, Opcode: 0x${lastOpcode.toString(16).padStart(2, '0')}`);
      console.log(`    SP changed: 0x${lastSP.toString(16)} -> 0x${sp.toString(16)}`);
    }
  }
  
  // Log milestones
  const pcHex = '0x' + pc.toString(16).padStart(4, '0');
  if (milestones[pcHex]) {
    console.log(`\n[${instructions}] Milestone: ${pcHex} - ${milestones[pcHex]}`);
    console.log(`    SP: 0x${sp.toString(16).padStart(4, '0')}, A: 0x${cpu.A.toString(16).padStart(2, '0')}`);
  }
  
  // Track CALL instructions
  if (opcode === 0xCD) { // CALL nn
    const target = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    callStack.push({
      from: pc,
      to: target,
      returnAddr: pc + 3,
      spBefore: sp,
      instruction: instructions
    });
  }
  
  // Track LD SP,nn (0x31) - this is how ROM sets SP
  if (opcode === 0x31) {
    const newSP = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    console.log(`\n[${instructions}] LD SP, 0x${newSP.toString(16).padStart(4, '0')} at PC=0x${pc.toString(16).padStart(4, '0')}`);
  }
  
  // Track ED 7B = LD SP,(nn) - loading SP from memory
  if (opcode === 0xED) {
    const edOpcode = memory.read(pc + 1);
    if (edOpcode === 0x7B) {
      const addr = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      const loadedSP = memory.read(addr) | (memory.read(addr + 1) << 8);
      console.log(`\n[${instructions}] LD SP,(0x${addr.toString(16).padStart(4, '0')}) = 0x${loadedSP.toString(16).padStart(4, '0')} at PC=0x${pc.toString(16).padStart(4, '0')}`);
    }
  }
  
  // Track RST 08 (error handler)
  if (opcode === 0xCF) {
    console.log(`\n[${instructions}] RST 08 at PC=0x${pc.toString(16).padStart(4, '0')}`);
    console.log(`    SP: 0x${sp.toString(16).padStart(4, '0')}, A: 0x${cpu.A.toString(16).padStart(2, '0')}`);
    if (sp < 0x4000) {
      console.log(`    *** SP is in ROM area - stack writes will fail!`);
    }
    break; // Stop at error
  }
  
  // Check RAMTOP periodically
  if (instructions % 5000 === 0 && instructions > 0) {
    const ramtop = memory.read(RAMTOP_ADDR) | (memory.read(RAMTOP_ADDR + 1) << 8);
    console.log(`\n[${instructions}] Status: PC=0x${pc.toString(16).padStart(4, '0')}, SP=0x${sp.toString(16).padStart(4, '0')}, RAMTOP=0x${ramtop.toString(16).padStart(4, '0')}`);
  }
  
  // Save for next iteration
  var lastPC = pc;
  var lastOpcode = opcode;
  lastSP = sp;
  
  // Execute
  try {
    cpu.step();
    instructions++;
    
    // Check for EI
    if (lastOpcode === 0xFB) {
      console.log(`\n[${instructions}] EI executed at PC=0x${lastPC.toString(16).padStart(4, '0')}`);
      console.log(`    SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
      console.log(`    Next PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
    }
    
  } catch (e) {
    console.log(`\nError at instruction ${instructions}: ${e.message}`);
    console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}, SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
    break;
  }
}

console.log('\n' + '='.repeat(80));
console.log('EXECUTION SUMMARY');
console.log('='.repeat(80));
console.log(`Total instructions: ${instructions}`);
console.log(`Final PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`Final SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);

// Show RAMTOP value
const ramtop = memory.read(RAMTOP_ADDR) | (memory.read(RAMTOP_ADDR + 1) << 8);
console.log(`\nRAMTOP (0x5CB2): 0x${ramtop.toString(16).padStart(4, '0')}`);

// SP change history
console.log('\n' + '='.repeat(80));
console.log('SP CHANGE HISTORY (first 20)');
console.log('='.repeat(80));
for (let i = 0; i < Math.min(20, spChanges.length); i++) {
  const change = spChanges[i];
  const inRom = change.newSP < 0x4000 ? ' [IN ROM!]' : '';
  console.log(`[${change.instruction}] PC=0x${change.pc.toString(16).padStart(4, '0')} ` +
    `Opcode=0x${change.opcode.toString(16).padStart(2, '0')} ` +
    `SP: 0x${change.oldSP.toString(16).padStart(4, '0')} -> 0x${change.newSP.toString(16).padStart(4, '0')}${inRom}`);
}

// Check if any SP values were in ROM
const romSPchanges = spChanges.filter(c => c.newSP < 0x4000);
if (romSPchanges.length > 0) {
  console.log(`\n*** WARNING: ${romSPchanges.length} times SP was set to ROM area (< 0x4000)!`);
  console.log('First occurrence:');
  const first = romSPchanges[0];
  console.log(`  Instruction ${first.instruction}, PC=0x${first.pc.toString(16).padStart(4, '0')}, SP changed to 0x${first.newSP.toString(16).padStart(4, '0')}`);
}

