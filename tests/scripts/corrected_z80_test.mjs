#!/usr/bin/env node

/**
 * Corrected test for Z80 ED prefix handling with proper RAM addresses
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

console.log('🔧 Z80 ED Prefix Debug Test');
console.log('============================');

try {
  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  console.log('✅ Memory and CPU initialized');
  console.log(`📝 Memory model: ${memory.model}`);
  console.log(`📝 Pages configured: ${memory.pages.length}`);
  
  // Test memory operations in RAM area (0x4000-0xFFFF)
  console.log('\n=== Testing Memory Operations ===');
  
  const testAddr = 0x5000; // Page 1 - RAM
  const testValue = 0x42;
  
  memory.write(testAddr, testValue);
  const readValue = memory.read(testAddr);
  console.log(`Memory write/read test at 0x${testAddr.toString(16)}:`);
  console.log(`  Write: 0x${testValue.toString(16)}`);
  console.log(`  Read: 0x${readValue.toString(16)}`);
  console.log(readValue === testValue ? '✅ PASS' : '❌ FAIL');
  
  // Test word operations
  const testWordAddr = 0x6000; // Page 1 - RAM
  const testWordValue = 0xABCD;
  
  memory.writeWord(testWordAddr, testWordValue);
  const readWordValue = memory.readWord(testWordAddr);
  console.log(`\nMemory word operations at 0x${testWordAddr.toString(16)}:`);
  console.log(`  Write: 0x${testWordValue.toString(16)}`);
  console.log(`  Read: 0x${readWordValue.toString(16)}`);
  console.log(readWordValue === testWordValue ? '✅ PASS' : '❌ FAIL');
  
  // Test ED prefix with LD HL,(nn)
  console.log('\n=== Testing ED LD HL,(nn) ===');
  
  // Set up test data in RAM
  const dataAddr = 0x7000; // Page 1 - RAM
  const expectedValue = 0x1234;
  memory.writeWord(dataAddr, expectedValue);
  console.log(`📝 Test data at 0x${dataAddr.toString(16)}: 0x${memory.readWord(dataAddr).toString(16)}`);
  
  // Set up instruction: ED 2A [addr_lo] [addr_hi] (LD HL,(nn))
  const instrAddr = 0x4000; // Page 1 - RAM
  memory.write(instrAddr, 0xED);    // ED prefix
  memory.write(instrAddr + 1, 0x2A); // LD HL,(nn)
  memory.write(instrAddr + 2, dataAddr & 0xFF);      // Low byte of address
  memory.write(instrAddr + 3, (dataAddr >> 8) & 0xFF); // High byte of address
  
  console.log(`📝 Instruction at 0x${instrAddr.toString(16)}:`);
  console.log(`   0x${memory.read(instrAddr).toString(16)} 0x${memory.read(instrAddr + 1).toString(16)} 0x${memory.read(instrAddr + 2).toString(16)} 0x${memory.read(instrAddr + 3).toString(16)}`);
  
  // Set CPU state
  cpu.reset();
  cpu.PC = instrAddr;
  
  console.log(`\n🔍 Before executing ED LD HL,(0x${dataAddr.toString(16)}):`);
  console.log(`   PC: 0x${cpu.PC.toString(16)}`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)}`);
  
  // Execute the ED instruction
  const edTstates = cpu.step();
  
  console.log(`\n🔍 After executing ED LD HL,(0x${dataAddr.toString(16)}):`);
  console.log(`   PC: 0x${cpu.PC.toString(16)} (expected: 0x${(instrAddr + 4).toString(16)})`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)} (expected: 0x${expectedValue.toString(16)})`);
  console.log(`   T-states: ${edTstates} (expected: 16)`);
  
  const pcCorrect = cpu.PC === (instrAddr + 4);
  const hlCorrect = cpu._getHL() === expectedValue;
  const tstatesCorrect = edTstates === 16;
  
  const success = pcCorrect && hlCorrect && tstatesCorrect;
  console.log(success ? '\n✅ ED prefix test PASSED' : '\n❌ ED prefix test FAILED');
  
  if (!success) {
    console.log('\n❌ Detailed failure analysis:');
    console.log(`   PC correct: ${pcCorrect ? 'YES' : 'NO'}`);
    console.log(`   HL correct: ${hlCorrect ? 'YES' : 'NO'}`);
    console.log(`   T-states correct: ${tstatesCorrect ? 'YES' : 'NO'}`);
    
    if (!pcCorrect) {
      console.log(`   ❌ PC should be 0x${(instrAddr + 4).toString(16)}, got 0x${cpu.PC.toString(16)}`);
    }
    if (!hlCorrect) {
      console.log(`   ❌ HL should be 0x${expectedValue.toString(16)}, got 0x${cpu._getHL().toString(16)}`);
    }
    if (!tstatesCorrect) {
      console.log(`   ❌ T-states should be 16, got ${edTstates}`);
    }
  } else {
    console.log('\n🎉 ED prefix handling is working correctly!');
  }
  
} catch (error) {
  console.error('\n❌ Error during test:', error.message);
  console.error(error.stack);
}