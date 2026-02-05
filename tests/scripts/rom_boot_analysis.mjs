/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node
/**
 * ROM Boot Sequence Analysis
 * Examines the first instructions of the Spectrum ROM to understand why no border changes occur
 */

import spec48 from './src/roms/spec48.js';
import { Memory } from './src/memory.mjs';

console.log('=== ROM BOOT SEQUENCE ANALYSIS ===\n');

// Create memory with ROM
const memory = new Memory(spec48);

console.log('ROM INFO:');
console.log('- ROM size:', spec48.length, 'bytes');
console.log('- ROM content (first 32 bytes):');
for (let i = 0; i < Math.min(32, spec48.length); i++) {
  const byte = spec48[i];
  const hex = byte.toString(16).padStart(2, '0');
  console.log(`  0x${i.toString(16).padStart(4, '0')}: 0x${hex} ${byte.toString(10).padStart(3)} ${byte >= 32 && byte < 127 ? `'${String.fromCharCode(byte)}'` : ' '}`);
}
console.log();

// Analyze boot sequence instructions
console.log('BOOT SEQUENCE ANALYSIS:');
console.log('Starting from PC=0x0000...\n');

let pc = 0x0000;
let outCount = 0;
let borderOutCount = 0;
const maxInstructions = 200; // Analyze first 200 instructions

for (let i = 0; i < maxInstructions && pc < spec48.length; i++) {
  const opcode = spec48[pc];
  
  // Log important instructions
  if (opcode === 0xD3) { // OUT (n),A
    const portByte = spec48[(pc + 1) % spec48.length];
    const fullPort = (0x00 << 8) | portByte; // A=0 at boot
    outCount++;
    
    if (portByte === 0xFE) {
      borderOutCount++;
      console.log(`Step ${i}: OUT (0xFE),A - Border change instruction at PC=0x${pc.toString(16)}`);
    }
  }
  
  // Show first few instructions in detail
  if (i < 20) {
    let instruction = '';
    switch (opcode) {
      case 0xD3: // OUT (n),A
        const port = spec48[(pc + 1) % spec48.length];
        instruction = `OUT (0x${port.toString(16)}),A`;
        pc += 2;
        break;
      case 0xDB: // IN A,(n)
        const inPort = spec48[(pc + 1) % spec48.length];
        instruction = `IN A,(0x${inPort.toString(16)})`;
        pc += 2;
        break;
      case 0xC3: // JP nn
        const addr = (spec48[(pc + 2) % spec48.length] << 8) | spec48[(pc + 1) % spec48.length];
        instruction = `JP 0x${addr.toString(16)}`;
        pc += 3;
        break;
      case 0xCD: // CALL nn
        const callAddr = (spec48[(pc + 2) % spec48.length] << 8) | spec48[(pc + 1) % spec48.length];
        instruction = `CALL 0x${callAddr.toString(16)}`;
        pc += 3;
        break;
      case 0xF3: // DI
        instruction = 'DI';
        pc += 1;
        break;
      case 0xFB: // EI
        instruction = 'EI';
        pc += 1;
        break;
      case 0x76: // HALT
        instruction = 'HALT';
        pc += 1;
        break;
      default:
        instruction = `DB 0x${opcode.toString(16)}`;
        pc += 1;
    }
    console.log(`PC=0x${(pc - (opcode === 0xD3 || opcode === 0xDB || opcode === 0xC3 || opcode === 0xCD ? (opcode === 0xC3 || opcode === 0xCD ? 3 : 2) : 1)).toString(16).padStart(4, '0')}: ${instruction}`);
  } else {
    // Skip to next instruction
    switch (opcode) {
      case 0xD3: case 0xDB: pc += 2; break; // OUT/IN with immediate
      case 0xC3: case 0xCD: pc += 3; break; // JP/CALL immediate
      default: pc += 1;
    }
  }
}

console.log(`\nINSTRUCTION SUMMARY:`);
console.log(`- Total OUT instructions found: ${outCount}`);
console.log(`- OUT to port 0xFE (border): ${borderOutCount}`);
console.log(`- First HALT found at instruction ${pc < spec48.length ? 'before' : 'after'} analysis`);

if (borderOutCount === 0) {
  console.log(`\n🔍 KEY FINDING: No OUT instructions to port 0xFE in first ${maxInstructions} instructions!`);
  console.log(`   This explains why border color never changes from initial value (0 = blue-grey).`);
  console.log(`   The ROM boot sequence may not set border color immediately.`);
} else {
  console.log(`\n✅ Found ${borderOutCount} border color change instructions in boot sequence`);
}

console.log(`\nRECOMMENDATION:`);
console.log(`If no OUT instructions to port 0xFE are found in the early boot sequence,`);
console.log(`the issue might be:`);
console.log(`1. Border color changes happen later in the boot process`);
console.log(`2. The emulator needs to run more instructions to reach border-setting code`);
console.log(`3. There may be a different initialization sequence required`);

// Search entire ROM for OUT to port 0xFE
console.log(`\n=== SEARCHING ENTIRE ROM ===`);
let totalOutInstructions = 0;
let totalBorderOut = 0;

for (let addr = 0; addr < spec48.length; addr++) {
  if (spec48[addr] === 0xD3) { // OUT instruction
    totalOutInstructions++;
    const portByte = spec48[(addr + 1) % spec48.length];
    if (portByte === 0xFE) {
      totalBorderOut++;
      console.log(`OUT to port 0xFE found at address 0x${addr.toString(16)}`);
    }
  }
}

console.log(`\nCOMPLETE ROM ANALYSIS:`);
console.log(`- Total OUT instructions in ROM: ${totalOutInstructions}`);
console.log(`- Total OUT to port 0xFE in ROM: ${totalBorderOut}`);

if (totalBorderOut === 0) {
  console.log(`\n🚨 CRITICAL FINDING: No OUT instructions to port 0xFE found in entire ROM!`);
  console.log(`   This means the ROM does not explicitly set border color.`);
  console.log(`   The blue-grey bars (border=0) are the default state.`);
} else {
  console.log(`\n✅ Found ${totalBorderOut} OUT instructions to port 0xFE in ROM`);
}
