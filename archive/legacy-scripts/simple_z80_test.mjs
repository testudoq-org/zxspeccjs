#!/usr/bin/env node

/**
 * Simple test to check Z80 basic functionality
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

console.log('🔧 Simple Z80 Test Starting...');

try {
  const memory = new Memory({ model: '48k' });
  console.log('✅ Memory created successfully');
  
  const cpu = new Z80(memory);
  console.log('✅ Z80 CPU created successfully');
  
  // Test basic memory operations
  memory.write(0x4000, 0x42);
  const value = memory.read(0x4000);
  console.log(`✅ Memory write/read test: wrote 0x42, read 0x${value.toString(16)}`);
  
  // Test CPU reset
  cpu.reset();
  console.log(`✅ CPU reset: PC=0x${cpu.PC.toString(16)}, HL=0x${cpu._getHL().toString(16)}`);
  
  // Test simple NOP instruction
  const tstates = cpu.step();
  console.log(`✅ NOP execution: tstates=${tstates}, PC=0x${cpu.PC.toString(16)}`);
  
  // Test ED prefix with LD HL,(nn)
  console.log('\n=== Testing ED LD HL,(nn) ===');
  
  // Set up test data
  memory.writeWord(0x2000, 0xABCD);
  console.log(`📝 Test data at 0x2000: 0x${memory.readWord(0x2000).toString(16)}`);
  
  // Set up instruction: ED 2A 00 20 (LD HL,(0x2000))
  memory.write(0x4000, 0xED);  // ED prefix
  memory.write(0x4001, 0x2A);  // LD HL,(nn)
  memory.write(0x4002, 0x00);  // Low byte of address
  memory.write(0x4003, 0x20);  // High byte of address
  
  // Set PC to instruction
  cpu.PC = 0x4000;
  console.log(`🔍 Before ED instruction:`);
  console.log(`   PC: 0x${cpu.PC.toString(16)}`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)}`);
  console.log(`   Memory[0x4000]: 0x${memory.read(0x4000).toString(16)}`);
  console.log(`   Memory[0x4001]: 0x${memory.read(0x4001).toString(16)}`);
  console.log(`   Memory[0x2000]: 0x${memory.readWord(0x2000).toString(16)}`);
  
  // Execute the ED instruction
  const edTstates = cpu.step();
  console.log(`🔍 After ED LD HL,(0x2000):`);
  console.log(`   PC: 0x${cpu.PC.toString(16)} (should be 0x4004)`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)} (should be 0xABCD)`);
  console.log(`   T-states: ${edTstates} (should be 16)`);
  
  const success = (cpu._getHL() === 0xABCD) && (cpu.PC === 0x4004) && (edTstates === 16);
  console.log(success ? '✅ ED prefix test PASSED' : '❌ ED prefix test FAILED');
  
  if (!success) {
    console.log('❌ Test failed - ED prefix handling is broken');
  }
  
} catch (error) {
  console.error('❌ Error during test:', error.message);
  console.error(error.stack);
}