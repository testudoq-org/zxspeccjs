#!/usr/bin/env node

/**
 * Simple test to verify Phase 2 Z80 operations implementation
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

function testZ80Operations() {
  console.log('🧪 Testing Z80 Phase 2 Operations\n');
  
  const memory = new Memory();
  const cpu = new Z80(memory);
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  function test(description, condition) {
    if (condition) {
      console.log(`✅ ${description}`);
      testsPassed++;
    } else {
      console.log(`❌ ${description}`);
      testsFailed++;
    }
  }
  
  // Test 1: Basic 16-bit ADC HL operation
  console.log('=== Testing 16-bit ADC HL Operations ===');
  cpu.reset();
  cpu._setHL(0x1000);
  cpu._setBC(0x0F00);
  cpu.setCarry(true);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x4A); // ADC HL,BC
  
  const tstates1 = cpu.step();
  test('ADC HL,BC: Correct result', cpu._getHL() === 0x1F01);
  test('ADC HL,BC: Correct t-states', tstates1 === 15);
  
  // Test 2: EX AF,AF' operation
  console.log('\n=== Testing Exchange Operations ===');
  cpu.reset();
  cpu.A = 0x12;
  cpu.F = 0x45;
  cpu.A_ = 0x34;
  cpu.F_ = 0x67;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x08); // EX AF,AF'
  
  cpu.step();
  test('EX AF,AF\': A swapped correctly', cpu.A === 0x34);
  test('EX AF,AF\': F swapped correctly', cpu.F === 0x67);
  
  // Test 3: EXX operation
  console.log('\n=== Testing EXX Operation ===');
  cpu.reset();
  cpu._setBC(0x1234);
  cpu._setDE(0x5678);
  cpu._setHL(0x9ABC);
  cpu.B_ = 0xFF; cpu.C_ = 0xEE;
  cpu.D_ = 0xDD; cpu.E_ = 0xCC;
  cpu.H_ = 0xBB; cpu.L_ = 0xAA;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xD9); // EXX
  
  cpu.step();
  test('EXX: BC swapped correctly', cpu._getBC() === 0xFFEE);
  test('EXX: DE swapped correctly', cpu._getDE() === 0xDDCC);
  test('EXX: HL swapped correctly', cpu._getHL() === 0xBBAA);
  
  // Test 4: Block memory operation LDI
  console.log('\n=== Testing Block Memory Operations ===');
  cpu.reset();
  cpu._setHL(0x1000);
  cpu._setDE(0x2000);
  cpu._setBC(0x0003);
  memory.write(0x1000, 0xAB);
  memory.write(0x2000, 0x00);
  cpu.PC = 0x3000;
  memory.write(0x3000, 0xED);
  memory.write(0x3001, 0xA0); // LDI
  
  cpu.step();
  test('LDI: Byte transferred correctly', memory.read(0x2000) === 0xAB);
  test('LDI: HL incremented', cpu._getHL() === 0x1001);
  test('LDI: DE incremented', cpu._getDE() === 0x2001);
  test('LDI: BC decremented', cpu._getBC() === 0x0002);
  
  // Test 5: EI/DI operations
  console.log('\n=== Testing Interrupt Management ===');
  cpu.reset();
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xFB); // EI
  
  cpu.step();
  test('EI: IFF1 enabled', cpu.IFF1 === true);
  test('EI: IFF2 enabled', cpu.IFF2 === true);
  
  cpu.PC = 0x1001;
  memory.write(0x1001, 0xF3); // DI
  
  cpu.step();
  test('DI: IFF1 disabled', cpu.IFF1 === false);
  test('DI: IFF2 disabled', cpu.IFF2 === false);
  
  // Test 6: IM modes
  console.log('\n=== Testing Interrupt Modes ===');
  cpu.reset();
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x46); // IM 0
  
  cpu.step();
  test('IM 0: Mode set correctly', cpu.IM === 0);
  
  cpu.PC = 0x1002;
  memory.write(0x1002, 0xED);
  memory.write(0x1003, 0x56); // IM 1
  
  cpu.step();
  test('IM 1: Mode set correctly', cpu.IM === 1);
  
  // Test 7: NEG operation
  console.log('\n=== Testing System Operations ===');
  cpu.reset();
  cpu.A = 0x42;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x44); // NEG
  
  cpu.step();
  test('NEG: Correct negation', cpu.A === 0xBE);
  
  // Test 8: CPL operation
  cpu.reset();
  cpu.A = 0xAB;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x2F); // CPL
  
  cpu.step();
  test('CPL: Correct complement', cpu.A === 0x54);
  
  // Test 9: 16-bit INC operations
  console.log('\n=== Testing 16-bit INC/DEC ===');
  cpu.reset();
  cpu._setBC(0xFFFF);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x03); // INC BC
  
  cpu.step();
  test('INC BC: Correct wrap-around', cpu._getBC() === 0x0000);
  
  // Test 10: ADC A,r operation
  console.log('\n=== Testing ADC A,r Operations ===');
  cpu.reset();
  cpu.A = 0xFF;
  cpu.B = 0x01;
  cpu.setCarry(false);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x88); // ADC A,B
  
  cpu.step();
  test('ADC A,B: Correct result', cpu.A === 0x00);
  test('ADC A,B: Carry set', cpu.getCarry() === true);
  test('ADC A,B: Zero set', cpu.getZero() === true);
  
  // Test 11: SBC A,r operation
  cpu.reset();
  cpu.A = 0x10;
  cpu.C = 0x05;
  cpu.setCarry(true);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x99); // SBC A,C
  
  cpu.step();
  test('SBC A,C: Correct result', cpu.A === 0x0A);
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=======================');
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed} ✅`);
  console.log(`Failed: ${testsFailed} ❌`);
  console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Phase 2 implementation is working correctly.');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.');
    return false;
  }
}

// Helper methods for easier testing
Z80.prototype.setCarry = function(carry) {
  if (carry) this.F |= 0x01; else this.F &= ~0x01;
};

Z80.prototype.getCarry = function() {
  return (this.F & 0x01) !== 0;
};

Z80.prototype.getZero = function() {
  return (this.F & 0x40) !== 0;
};

Z80.prototype.getSign = function() {
  return (this.F & 0x80) !== 0;
};

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testZ80Operations();
}