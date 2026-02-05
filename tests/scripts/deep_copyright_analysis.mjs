/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node

/**
 * Deep Copyright Display Analysis
 * Examine the actual copyright string and display routine
 */

import { readFileSync } from 'fs';

console.log('🔍 DEEP COPYRIGHT DISPLAY ANALYSIS');
console.log('=' .repeat(50));

// Load ROM data
const romPath = './src/roms/spec48.js';
let romData;

try {
  const romModule = await import(romPath);
  romData = romModule.default.bytes;
  console.log(`✅ ROM loaded: ${romData.length} bytes`);
} catch (error) {
  console.error(`❌ Failed to load ROM: ${error.message}`);
  process.exit(1);
}

// Helper functions
function getByte(address) {
  if (address >= 0 && address < romData.length) {
    return romData[address];
  }
  return null;
}

function getWord(address) {
  const low = getByte(address);
  const high = getByte(address + 1);
  if (low !== null && high !== null) {
    return (high << 8) | low;
  }
  return null;
}

function bytesToString(startAddr, length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    const byte = getByte(startAddr + i);
    if (byte === null || byte === 0) break;
    result += String.fromCharCode(byte);
  }
  return result;
}

// 1. Examine the copyright string at 0x153B
console.log('\n📍 COPYRIGHT STRING AT 0x153B');
console.log('=' .repeat(40));

const copyrightAddr = 0x153B;
console.log(`🔍 Examining area around 0x${copyrightAddr.toString(16).toUpperCase()}:`);

// Look for the copyright string and surrounding area
for (let offset = -20; offset <= 50; offset++) {
  const addr = copyrightAddr + offset;
  const byte = getByte(addr);
  if (byte !== null) {
    const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
    const hex = byte.toString(16).toUpperCase().padStart(2, '0');
    console.log(`  ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${hex} ${char} ${addr === copyrightAddr ? '<-- COPYRIGHT STRING' : ''}`);
  }
}

// Extract the complete copyright message
console.log('\n🔍 EXTRACTING COPYRIGHT MESSAGE:');
let copyrightMessage = '';
let i = copyrightAddr;
while (i < romData.length) {
  const byte = getByte(i);
  if (byte === 0 || byte < 32) break;
  copyrightMessage += String.fromCharCode(byte);
  i++;
}
console.log(`  Found: "${copyrightMessage}"`);

// 2. Find the actual copyright display routine
console.log('\n📍 FINDING COPYRIGHT DISPLAY ROUTINE');
console.log('=' .repeat(45));

// Search backwards from the string for the display routine
console.log('\n🔍 Searching for code that prints this string:');
let displayRoutineFound = false;

for (let searchAddr = copyrightAddr - 100; searchAddr < copyrightAddr; searchAddr++) {
  // Look for LD HL, address patterns that point to the copyright string
  const opcode1 = getByte(searchAddr);
  const opcode2 = getByte(searchAddr + 1);
  const opcode3 = getByte(searchAddr + 2);
  
  // Check for LD HL,nn (21 nn nn)
  if (opcode1 === 0x21) {
    const addr = getWord(searchAddr + 1);
    if (addr === copyrightAddr) {
      console.log(`  Found LD HL,${addr.toString(16).toUpperCase()} at ${searchAddr.toString(16).toUpperCase()}`);
      
      // Disassemble surrounding code
      console.log(`  Disassembling around ${searchAddr.toString(16).toUpperCase()}:`);
      for (let i = -10; i <= 20; i++) {
        const addr = searchAddr + i;
        const opcode = getByte(addr);
        if (opcode !== null) {
          const instr = disassembleSimple(addr);
          console.log(`    ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} ${instr}`);
        }
      }
      displayRoutineFound = true;
    }
  }
}

// 3. Look for REPORT-J routine more systematically
console.log('\n📍 EXAMINING REPORT-J ROUTINE AT 0x15C4');
console.log('=' .repeat(50));

const reportJAddr = 0x15C4;
console.log('🔍 REPORT-J routine disassembly:');

// Look for the actual copyright display call
for (let i = 0; i < 50; i++) {
  const addr = reportJAddr + i;
  const opcode = getByte(addr);
  if (opcode !== null) {
    const instr = disassembleSimple(addr);
    
    // Check if this is calling a routine that displays the copyright
    if (opcode === 0xCD) { // CALL nn
      const callAddr = getWord(addr + 1);
      console.log(`  ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} ${instr} <-- CALL TO ${callAddr.toString(16).toUpperCase()}`);
      
      // If this call is near our copyright string, examine it
      if (Math.abs(callAddr - copyrightAddr) < 50) {
        console.log(`    ^ This might be the copyright display routine!`);
      }
    } else {
      console.log(`  ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} ${instr}`);
    }
  }
}

// 4. Look for the actual copyright printing routine
console.log('\n📍 SEARCHING FOR COPYRIGHT PRINTING ROUTINE');
console.log('=' .repeat(50));

// The copyright string is at 0x153B, let's see what's around it
console.log('🔍 Code around copyright string:');
for (let i = -30; i <= 30; i++) {
  const addr = copyrightAddr + i;
  const opcode = getByte(addr);
  if (opcode !== null) {
    const instr = disassembleSimple(addr);
    const marker = i === 0 ? ' <-- STRING STARTS' : '';
    console.log(`  ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} ${instr}${marker}`);
  }
}

// 5. Check what calls the copyright display
console.log('\n📍 TRACING CALLS TO COPYRIGHT ROUTINE');
console.log('=' .repeat(45));

console.log('🔍 Looking for calls that lead to copyright display:');

// Search for calls that might lead to the copyright routine
for (let addr = 0x1000; addr < 0x2000; addr++) {
  const opcode = getByte(addr);
  if (opcode === 0xCD) { // CALL nn
    const callAddr = getWord(addr + 1);
    // Check if this call is in the range where copyright display might be
    if (callAddr >= 0x1530 && callAddr <= 0x1570) {
      console.log(`  Call from ${addr.toString(16).toUpperCase()} to ${callAddr.toString(16).toUpperCase()}`);
      
      // Show the calling context
      console.log(`    Context:`);
      for (let i = -5; i <= 5; i++) {
        const ctxAddr = addr + i;
        const ctxOpcode = getByte(ctxAddr);
        if (ctxOpcode !== null) {
          const ctxInstr = disassembleSimple(ctxAddr);
          const marker = i === 0 ? ' <-- CALL HERE' : '';
          console.log(`      ${ctxAddr.toString(16).toUpperCase().padStart(4, '0')}: ${ctxOpcode.toString(16).padStart(2, '0')} ${ctxInstr}${marker}`);
        }
      }
    }
  }
}

// 6. Find the actual boot path to copyright
console.log('\n📍 FINDING BOOT PATH TO COPYRIGHT');
console.log('=' .repeat(40));

console.log('🔍 Checking MAIN-EXEC (0x12A2) flow:');
const mainExecAddr = 0x12A2;
for (let i = 0; i < 30; i++) {
  const addr = mainExecAddr + i;
  const opcode = getByte(addr);
  if (opcode !== null) {
    const instr = disassembleSimple(addr);
    console.log(`  ${addr.toString(16).toUpperCase().padStart(4, '0')}: ${opcode.toString(16).padStart(2, '0')} ${instr}`);
    
    // Look for calls that might lead to copyright
    if (opcode === 0xCD) {
      const callAddr = getWord(addr + 1);
      console.log(`    ^ CALLS TO ${callAddr.toString(16).toUpperCase()}`);
    }
  }
}

// Simple disassembler for common instructions
function disassembleSimple(addr) {
  const opcode = getByte(addr);
  if (opcode === null) return '???';
  
  const instructions = {
    0x00: 'NOP', 0x01: 'LD BC,nn', 0x02: 'LD (BC),A', 0x03: 'INC BC',
    0x04: 'INC B', 0x05: 'DEC B', 0x06: 'LD B,n', 0x07: 'RLCA',
    0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x0E: 'LD C,n', 0x0F: 'RRCA',
    0x10: 'DJNZ d', 0x11: 'LD DE,nn', 0x12: 'LD (DE),A', 0x13: 'INC DE',
    0x14: 'INC D', 0x15: 'DEC D', 0x16: 'LD D,n', 0x17: 'RLA',
    0x18: 'JR d', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
    0x1C: 'INC E', 0x1D: 'DEC E', 0x1E: 'LD E,n', 0x1F: 'RRA',
    0x20: 'JR NZ,d', 0x21: 'LD HL,nn', 0x22: 'LD (nn),HL', 0x23: 'INC HL',
    0x24: 'INC H', 0x25: 'DEC H', 0x26: 'LD H,n', 0x27: 'DAA',
    0x28: 'JR Z,d', 0x29: 'ADD HL,HL', 0x2A: 'LD HL,(nn)', 0x2B: 'DEC HL',
    0x2C: 'INC L', 0x2D: 'DEC L', 0x2E: 'LD L,n', 0x2F: 'CPL',
    0x30: 'JR NC,d', 0x31: 'LD SP,nn', 0x32: 'LD (nn),A', 0x33: 'INC SP',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x36: 'LD (HL),n', 0x37: 'SCF',
    0x38: 'JR C,d', 0x39: 'ADD HL,SP', 0x3A: 'LD A,(nn)', 0x3B: 'DEC SP',
    0x3C: 'INC A', 0x3D: 'DEC A', 0x3E: 'LD A,n', 0x3F: 'CCF',
    0x40: 'LD B,B', 0x41: 'LD B,C', 0x42: 'LD B,D', 0x43: 'LD B,E',
    0x44: 'LD B,H', 0x45: 'LD B,L', 0x46: 'LD B,(HL)', 0x47: 'LD B,A',
    0x48: 'LD C,B', 0x49: 'LD C,C', 0x4A: 'LD C,D', 0x4B: 'LD C,E',
    0x4C: 'LD C,H', 0x4D: 'LD C,L', 0x4E: 'LD C,(HL)', 0x4F: 'LD C,A',
    0x76: 'HALT', 0xC3: 'JP nn', 0xC9: 'RET', 0xCD: 'CALL nn',
    0xF3: 'DI', 0xFB: 'EI', 0xF7: 'RST 10', 0xCF: 'RST 8',
    0xD7: 'RST 10', 0xEF: 'RST 28', 0xFF: 'RST 38'
  };
  
  const instr = instructions[opcode];
  if (!instr) return `DB ${opcode.toString(16).toUpperCase()}`;
  
  // Handle immediate values
  if (instr.includes('nn') && opcode !== 0x21 && opcode !== 0x22 && opcode !== 0x2A) {
    const value = getByte(addr + 1);
    return instr.replace('n', value.toString(16).toUpperCase());
  } else if (instr.includes('nn')) {
    const value = getWord(addr + 1);
    return instr.replace('nn', value.toString(16).toUpperCase());
  } else if (instr.includes('d')) {
    const offset = getByte(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFF;
    return instr.replace('d', `$${target.toString(16).toUpperCase()}`);
  }
  
  return instr;
}

console.log('\n' + '=' .repeat(70));
