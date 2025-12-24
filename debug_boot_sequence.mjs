#!/usr/bin/env node

/**
 * Debug the boot sequence failure at PC 0x11CB
 * Test the specific LD HL,(5C5Dh) operation that causes boot failure
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

class BootSequenceDebugger {
  constructor() {
    this.memory = new Memory({ model: '48k' });
    this.cpu = new Z80(this.memory);
  }

  resetCPU() {
    this.cpu.reset();
    // Clear memory
    for (let i = 0; i < 0x10000; i++) {
      this.memory.write(i, 0);
    }
  }

  // Load the ZX Spectrum 48K ROM
  loadSpectrumROM() {
    // For now, let's create a minimal test ROM that includes the problematic instruction
    // The audit report mentions failure at PC 0x11CB with LD HL,(5C5Dh)
    
    // Create a simple test program that includes the problematic instruction sequence
    const program = [
      0xED, 0x2A, 0x5D, 0x5C  // LD HL,(5C5Dh) - the problematic instruction
    ];
    
    // Load at address 0x11CB
    for (let i = 0; i < program.length; i++) {
      this.memory.write(0x11CB + i, program[i]);
    }
    
    // Set up some test data at 5C5Dh
    this.memory.writeWord(0x5C5D, 0x1234); // Test data
    console.log(`📝 Loaded test program at 0x11CB`);
    console.log(`📝 Set up test data at 0x5C5D: ${this.memory.readWord(0x5C5D).toString(16)}`);
  }

  // Test ED prefix handling specifically
  testEDPrefix() {
    console.log('\n=== Testing ED Prefix Handling ===');
    
    // Test simple ED opcode: LD HL,(nn) at 0x2A
    this.resetCPU();
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);  // ED prefix
    this.memory.write(0x1001, 0x2A);  // LD HL,(nn)
    this.memory.write(0x1002, 0x34);  // Low byte of address
    this.memory.write(0x1003, 0x12);  // High byte of address (0x1234)
    
    // Set test data at 0x1234
    this.memory.writeWord(0x1234, 0xABCD);
    
    console.log(`🔍 Before execution:`);
    console.log(`   PC: 0x${this.cpu.PC.toString(16)}`);
    console.log(`   HL: 0x${this.cpu._getHL().toString(16)}`);
    console.log(`   Memory[0x1000]: 0x${this.memory.read(0x1000).toString(16)}`);
    console.log(`   Memory[0x1001]: 0x${this.memory.read(0x1001).toString(16)}`);
    console.log(`   Memory[0x1234]: 0x${this.memory.readWord(0x1234).toString(16)}`);
    
    try {
      const tstates = this.cpu.step();
      console.log(`🔍 After execution:`);
      console.log(`   PC: 0x${this.cpu.PC.toString(16)} (expected: 0x1004)`);
      console.log(`   HL: 0x${this.cpu._getHL().toString(16)} (expected: 0xABCD)`);
      console.log(`   T-states: ${tstates} (expected: 16)`);
      
      const success = (this.cpu._getHL() === 0xABCD) && (this.cpu.PC === 0x1004) && (tstates === 16);
      console.log(success ? '✅ ED prefix test PASSED' : '❌ ED prefix test FAILED');
      return success;
    } catch (error) {
      console.log(`❌ ED prefix test ERROR: ${error.message}`);
      return false;
    }
  }

  // Test the actual boot sequence failure
  testBootSequenceFailure() {
    console.log('\n=== Testing Boot Sequence Failure ===');
    
    this.resetCPU();
    this.loadSpectrumROM();
    
    // Set PC to the problematic location
    this.cpu.PC = 0x11CB;
    
    console.log(`🔍 Before executing LD HL,(5C5Dh):`);
    console.log(`   PC: 0x${this.cpu.PC.toString(16)}`);
    console.log(`   HL: 0x${this.cpu._getHL().toString(16)}`);
    console.log(`   Memory[5C5Dh]: 0x${this.memory.readWord(0x5C5D).toString(16)}`);
    console.log(`   Memory[0x11CB]: 0x${this.memory.read(0x11CB).toString(16)}`);
    console.log(`   Memory[0x11CC]: 0x${this.memory.read(0x11CC).toString(16)}`);
    
    try {
      const tstates = this.cpu.step();
      console.log(`🔍 After executing LD HL,(5C5Dh):`);
      console.log(`   PC: 0x${this.cpu.PC.toString(16)} (should advance)`);
      console.log(`   HL: 0x${this.cpu._getHL().toString(16)} (should be 0x1234)`);
      console.log(`   T-states: ${tstates}`);
      
      const success = (this.cpu._getHL() === 0x1234);
      console.log(success ? '✅ Boot sequence test PASSED' : '❌ Boot sequence test FAILED');
      return success;
    } catch (error) {
      console.log(`❌ Boot sequence test ERROR: ${error.message}`);
      console.log(`Stack: ${error.stack}`);
      return false;
    }
  }

  // Test memory operations directly
  testMemoryOperations() {
    console.log('\n=== Testing Memory Operations ===');
    
    this.resetCPU();
    
    // Test basic read/write
    const testAddr = 0x5000;
    const testValue = 0xAB;
    
    this.memory.write(testAddr, testValue);
    const readValue = this.memory.read(testAddr);
    
    console.log(`Memory write/read test:`);
    console.log(`  Write: ${testValue.toString(16)} at ${testAddr.toString(16)}`);
    console.log(`  Read: ${readValue.toString(16)}`);
    console.log(readValue === testValue ? '✅ PASS' : '❌ FAIL');
    
    // Test word operations
    const testWordAddr = 0x6000;
    const testWordValue = 0x1234;
    
    this.memory.writeWord(testWordAddr, testWordValue);
    const readWordValue = this.memory.readWord(testWordAddr);
    
    console.log(`Memory word operations:`);
    console.log(`  Write: ${testWordValue.toString(16)} at ${testWordAddr.toString(16)}`);
    console.log(`  Read: ${readWordValue.toString(16)}`);
    console.log(readWordValue === testWordValue ? '✅ PASS' : '❌ FAIL');
    
    return (readValue === testValue) && (readWordValue === testWordValue);
  }

  runAllTests() {
    console.log('🔧 Boot Sequence Debugger');
    console.log('=========================');
    
    const memResult = this.testMemoryOperations();
    const edResult = this.testEDPrefix();
    const bootResult = this.testBootSequenceFailure();
    
    console.log('\n📊 Debug Results Summary');
    console.log('========================');
    console.log(`Memory Operations: ${memResult ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`ED Prefix Handling: ${edResult ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`Boot Sequence: ${bootResult ? 'PASS ✅' : 'FAIL ❌'}`);
    
    if (!edResult || !bootResult) {
      console.log('\n🔍 Root cause identified: ED prefix handling is broken');
      console.log('This explains why the boot sequence fails at PC 0x11CB');
    }
    
    return memResult && edResult && bootResult;
  }
}

// Run the debugger
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbg = new BootSequenceDebugger();
  const success = dbg.runAllTests();
  process.exit(success ? 0 : 1);
}

export { BootSequenceDebugger };