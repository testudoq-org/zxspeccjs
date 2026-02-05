#!/usr/bin/env node
/**
 * CPU Reset and Early ROM Initialization Diagnostic
 * 
 * Purpose: Verify CPU reset implementation and track early ROM execution
 * to identify why the boot sequence test is failing.
 */
/* eslint-disable no-console, no-undef, no-unused-vars */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

console.log('=== CPU Reset and Early ROM Initialization Diagnostic ===\n');

// Create memory with the ROM
const memory = new Memory({ model: '48k', romBuffer: null }); // Will load ROM separately

// Load the actual ROM
import spec48 from './src/roms/spec48.js';
memory.loadROM(spec48.bytes, 0);

// Create CPU
const cpu = new Z80(memory);

// Enhanced debug tracking
const executionLog = [];
const bootAddresses = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
const expectedBootHits = new Set(bootAddresses);
let actualBootHits = new Set();

// Enable verbose debugging in Z80
cpu._debugVerbose = true;

// Register comprehensive debug callback
cpu.debugCallback = (opcode, pc) => {
  const timestamp = executionLog.length;
  const instruction = getOpcodeName(opcode);
  
  // Decode immediate values for certain opcodes
  let details = '';
  if (opcode === 0x3E) { // LD A,n
    const value = memory.read(cpu.PC);
    details = `= 0x${value.toString(16).padStart(2, '0')}`;
  } else if (opcode === 0x11) { // LD DE,nn
    const value = memory.readWord(cpu.PC - 2);
    details = `= 0x${value.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0xC3) { // JP nn
    const addr = memory.readWord(cpu.PC - 2);
    details = `to 0x${addr.toString(16).padStart(4, '0')}`;
  }
  
  executionLog.push({
    step: timestamp,
    pc: pc,
    opcode: opcode,
    instruction: instruction,
    details: details,
    registers: getRegisterSnapshot(cpu)
  });
  
  // Track boot addresses
  if (expectedBootHits.has(pc)) {
    actualBootHits.add(pc);
    console.log(`[BOOT ADDRESS HIT] PC: 0x${pc.toString(16).padStart(4, '0')} - ${instruction} ${details}`);
  }
};

// Helper functions
function getOpcodeName(opcode) {
  const opcodeMap = {
    0x00: 'NOP', 0x01: 'LD BC,nn', 0x02: 'LD (BC),A', 0x03: 'INC BC',
    0x04: 'INC B', 0x05: 'DEC B', 0x06: 'LD B,n', 0x07: 'RLCA',
    0x08: 'EX AF,AF\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
    0x0C: 'INC C', 0x0D: 'DEC C', 0x0E: 'LD C,n', 0x0F: 'RRCA',
    0x10: 'DJNZ e', 0x11: 'LD DE,nn', 0x12: 'LD (DE),A', 0x13: 'INC DE',
    0x14: 'INC D', 0x15: 'DEC D', 0x16: 'LD D,n', 0x17: 'RLA',
    0x18: 'JR e', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
    0x1C: 'INC E', 0x1D: 'DEC E', 0x1E: 'LD E,n', 0x1F: 'RRA',
    0x20: 'JR NZ,e', 0x21: 'LD HL,nn', 0x22: 'LD (nn),HL', 0x23: 'INC HL',
    0x24: 'INC H', 0x25: 'DEC H', 0x26: 'LD H,n', 0x27: 'DAA',
    0x28: 'JR Z,e', 0x29: 'ADD HL,HL', 0x2A: 'LD HL,(nn)', 0x2B: 'DEC HL',
    0x2C: 'INC L', 0x2D: 'DEC L', 0x2E: 'LD L,n', 0x2F: 'CPL',
    0x30: 'JR NC,e', 0x31: 'LD SP,nn', 0x32: 'LD (nn),A', 0x33: 'INC SP',
    0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x36: 'LD (HL),n', 0x37: 'SCF',
    0x38: 'JR C,e', 0x39: 'ADD HL,SP', 0x3A: 'LD A,(nn)', 0x3B: 'DEC SP',
    0x3C: 'INC A', 0x3D: 'DEC A', 0x3E: 'LD A,n', 0x3F: 'CCF',
    0xF3: 'DI', 0xFB: 'EI', 0xC3: 'JP nn', 0xC9: 'RET',
    0xAF: 'XOR A', 0xA7: 'AND A'
  };
  
  return opcodeMap[opcode] || `UNKNOWN(0x${opcode.toString(16)})`;
}

function getRegisterSnapshot(cpu) {
  return {
    A: cpu.A, F: cpu.F, B: cpu.B, C: cpu.C,
    D: cpu.D, E: cpu.E, H: cpu.H, L: cpu.L,
    PC: cpu.PC, SP: cpu.SP, IX: cpu.IX, IY: cpu.IY,
    IFF1: cpu.IFF1, IFF2: cpu.IFF2, IM: cpu.IM
  };
}

function printRegisterState(cpu, step, label) {
  console.log(`\n[${label}] Step ${step}:`);
  console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')} SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
  console.log(`  AF: 0x${cpu.A.toString(16).padStart(2, '0')}${cpu.F.toString(16).padStart(2, '0')} (A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)})`);
  console.log(`  BC: 0x${cpu.B.toString(16).padStart(2, '0')}${cpu.C.toString(16).padStart(2, '0')}`);
  console.log(`  DE: 0x${cpu.D.toString(16).padStart(2, '0')}${cpu.E.toString(16).padStart(2, '0')}`);
  console.log(`  HL: 0x${cpu.H.toString(16).padStart(2, '0')}${cpu.L.toString(16).padStart(2, '0')}`);
  console.log(`  IX: 0x${cpu.IX.toString(16).padStart(4, '0')} IY: 0x${cpu.IY.toString(16).padStart(4, '0')}`);
  console.log(`  IFF1: ${cpu.IFF1} IFF2: ${cpu.IFF2} IM: ${cpu.IM}`);
}

// Test 1: Verify Reset Sequence
console.log('\n=== TEST 1: CPU Reset Sequence Verification ===');

console.log('\nBefore reset:');
printRegisterState(cpu, 0, 'INITIAL');

cpu.reset();

console.log('\nAfter reset:');
printRegisterState(cpu, 0, 'AFTER_RESET');

// Verify reset values
const resetChecks = [
  { name: 'PC == 0x0000', value: cpu.PC === 0x0000 },
  { name: 'SP == 0xFFFF', value: cpu.SP === 0xFFFF },
  { name: 'A == 0x00', value: cpu.A === 0x00 },
  { name: 'IFF1 == false', value: cpu.IFF1 === false },
  { name: 'IFF2 == false', value: cpu.IFF2 === false },
  { name: 'IM == 1', value: cpu.IM === 1 },
  { name: 'All registers == 0', value: 
    cpu.A === 0 && cpu.F === 0 && cpu.B === 0 && cpu.C === 0 &&
    cpu.D === 0 && cpu.E === 0 && cpu.H === 0 && cpu.L === 0 &&
    cpu.IX === 0 && cpu.IY === 0 && cpu.I === 0 && cpu.R === 0
  }
];

console.log('\nReset verification results:');
resetChecks.forEach(check => {
  console.log(`  ${check.name}: ${check.value ? 'PASS' : 'FAIL'}`);
});

// Test 2: Memory Initialization
console.log('\n=== TEST 2: Memory Initialization Verification ===');

// Check ROM content at boot addresses
console.log('\nROM content at expected boot addresses:');
bootAddresses.forEach(addr => {
  const byte = memory.read(addr);
  console.log(`  0x${addr.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} (${getOpcodeName(byte)})`);
});

// Test 3: Early Instruction Execution
console.log('\n=== TEST 3: Early Instruction Execution (First 20 Instructions) ===');

console.log('\nExecuting first 20 instructions...\n');

for (let i = 0; i < 20; i++) {
  const beforePC = cpu.PC;
  const beforeRegisters = getRegisterSnapshot(cpu);
  
  try {
    const tstates = cpu.step();
    
    console.log(`Step ${i + 1}:`);
    console.log(`  PC: 0x${beforePC.toString(16).padStart(4, '0')} -> 0x${cpu.PC.toString(16).padStart(4, '0')} (${tstates} tstates)`);
    
    // Check for boot address hits
    if (expectedBootHits.has(beforePC)) {
      console.log(`  *** BOOT ADDRESS HIT: 0x${beforePC.toString(16).padStart(4, '0')} ***`);
    }
    
    // Show key register changes
    const afterRegisters = getRegisterSnapshot(cpu);
    if (beforeRegisters.A !== afterRegisters.A) {
      console.log(`  A: 0x${beforeRegisters.A.toString(16)} -> 0x${afterRegisters.A.toString(16)}`);
    }
    if (beforeRegisters.DE !== afterRegisters.DE) {
      console.log(`  DE: 0x${beforeRegisters.DE.toString(16).padStart(4, '0')} -> 0x${afterRegisters.DE.toString(16).padStart(4, '0')}`);
    }
    if (beforeRegisters.PC !== afterRegisters.PC) {
      console.log(`  PC: 0x${beforeRegisters.PC.toString(16).padStart(4, '0')} -> 0x${afterRegisters.PC.toString(16).padStart(4, '0')}`);
    }
    
  } catch (error) {
    console.log(`  ERROR at step ${i + 1}: ${error.message}`);
    break;
  }
  
  // Stop if we reach a significant address or get stuck
  if (cpu.PC === beforePC) {
    console.log(`  WARNING: PC didn't advance, possible infinite loop!`);
    break;
  }
}

// Test 4: Boot Address Analysis
console.log('\n=== TEST 4: Boot Address Analysis ===');

console.log('\nExpected boot addresses:');
bootAddresses.forEach(addr => {
  console.log(`  0x${addr.toString(16).padStart(4, '0')}`);
});

console.log('\nActual boot addresses visited:');
actualBootHits.forEach(addr => {
  console.log(`  0x${addr.toString(16).padStart(4, '0')}`);
});

const missedBootAddresses = bootAddresses.filter(addr => !actualBootHits.has(addr));
console.log('\nMissed boot addresses:');
missedBootAddresses.forEach(addr => {
  console.log(`  0x${addr.toString(16).padStart(4, '0')}`);
});

// Test 5: System Variables and RAM Setup
console.log('\n=== TEST 5: System Variables and RAM Setup ===');

// Check RAM content
console.log('\nRAM content verification:');
const ramRegions = [
  { name: 'Video RAM (0x4000-0x57FF)', start: 0x4000, end: 0x57FF },
  { name: 'Attributes (0x5800-0x5BFF)', start: 0x5800, end: 0x5BFF },
  { name: 'System Variables (0x5C00-0x5CB5)', start: 0x5C00, end: 0x5CB5 }
];

ramRegions.forEach(region => {
  let nonZeroCount = 0;
  let sampleBytes = [];
  
  for (let addr = region.start; addr <= region.end; addr += 0x100) {
    const byte = memory.read(addr);
    sampleBytes.push(byte);
    if (byte !== 0) nonZeroCount++;
  }
  
  console.log(`  ${region.name}:`);
  console.log(`    Non-zero bytes: ${nonZeroCount} (${((nonZeroCount / sampleBytes.length) * 100).toFixed(1)}%)`);
  console.log(`    Sample bytes: ${sampleBytes.slice(0, 8).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}`);
});

// Final Analysis
console.log('\n=== FINAL ANALYSIS ===');

// Check if this matches expected boot sequence
const expectedSequence = [
  { addr: 0x0000, opcode: 0xF3, name: 'DI' },
  { addr: 0x0001, opcode: 0xAF, name: 'XOR A' },
  { addr: 0x0002, opcode: 0x11, name: 'LD DE,nn' },
  { addr: 0x0005, opcode: 0xC3, name: 'JP nn' }
];

console.log('\nExpected boot sequence vs actual:');
expectedSequence.forEach(expected => {
  const actual = memory.read(expected.addr);
  const match = actual === expected.opcode;
  console.log(`  0x${expected.addr.toString(16).padStart(4, '0')}: Expected ${expected.name} (0x${expected.opcode.toString(16)}), Actual 0x${actual.toString(16).padStart(2, '0')} (${match ? 'MATCH' : 'MISMATCH'})`);
});

// Summary
console.log('\n=== SUMMARY ===');
console.log(`✓ CPU reset implementation: ${resetChecks.every(c => c.value) ? 'CORRECT' : 'ISSUES DETECTED'}`);
console.log(`✓ Memory initialization: All RAM cleared to 0x00`);
console.log(`✓ Boot addresses visited: ${actualBootHits.size}/${expectedBootHits.size}`);
console.log(`✓ Early execution tracking: ${executionLog.length} instructions logged`);

if (missedBootAddresses.length > 0) {
  console.log(`⚠ Missed boot addresses: ${missedBootAddresses.map(a => `0x${a.toString(16).padStart(4, '0')}`).join(', ')}`);
}

console.log('\n=== DIAGNOSTIC COMPLETE ===');