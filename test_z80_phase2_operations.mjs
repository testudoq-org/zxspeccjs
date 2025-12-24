#!/usr/bin/env node

/**
 * Comprehensive test suite for Phase 2 Z80 operations
 * Tests all newly implemented Z80 opcodes and operations
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

class Z80Phase2Test {
  constructor() {
    this.memory = new Memory();
    this.cpu = new Z80(this.memory);
    this.testsRun = 0;
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  resetCPU() {
    this.cpu.reset();
    // Clear memory
    for (let i = 0; i < 0x10000; i++) {
      this.memory.write(i, 0);
    }
  }

  assert(condition, testName) {
    this.testsRun++;
    if (condition) {
      this.testsPassed++;
      console.log(`✅ PASS: ${testName}`);
    } else {
      this.testsFailed++;
      console.log(`❌ FAIL: ${testName}`);
    }
  }

  // Test helper to set flags easily
  setFlags(s, z, h, p, n, c) {
    let flags = 0;
    if (s) flags |= 0x80;
    if (z) flags |= 0x40;
    if (h) flags |= 0x10;
    if (p) flags |= 0x04;
    if (n) flags |= 0x02;
    if (c) flags |= 0x01;
    this.cpu.F = flags;
  }

  // Test 16-bit ADC HL operations
  testADC_HL_operations() {
    console.log('\n=== Testing 16-bit ADC HL Operations ===');
    
    // Test ADC HL,BC (0xED4A)
    this.resetCPU();
    this.cpu._setHL(0x1000);
    this.cpu._setBC(0x0F00);
    this.setFlags(false, false, false, false, false, true); // Set carry flag
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x4A);
    
    const tstates = this.cpu.step();
    this.assert(this.cpu._getHL() === 0x1F01, 'ADC HL,BC: HL = 0x1000 + 0x0F00 + carry = 0x1F01');
    this.assert(tstates === 15, 'ADC HL,BC: T-states = 15');
    this.assert((this.cpu.F & 0x01) === 0, 'ADC HL,BC: Carry flag cleared');
    this.assert((this.cpu.F & 0x40) === 0, 'ADC HL,BC: Zero flag cleared');
    
    // Test ADC HL,DE (0xED5A)
    this.resetCPU();
    this.cpu._setHL(0xFFFF);
    this.cpu._setDE(0x0001);
    this.setFlags(false, false, false, false, false, false); // No carry
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x5A);
    
    this.cpu.step();
    this.assert(this.cpu._getHL() === 0x0000, 'ADC HL,DE: HL = 0xFFFF + 0x0001 = 0x0000 (overflow)');
    this.assert((this.cpu.F & 0x01) !== 0, 'ADC HL,DE: Carry flag set on overflow');
    this.assert((this.cpu.F & 0x40) !== 0, 'ADC HL,DE: Zero flag set on result = 0');
  }

  // Test 16-bit SBC HL operations
  testSBC_HL_operations() {
    console.log('\n=== Testing 16-bit SBC HL Operations ===');
    
    // Test SBC HL,BC (0xED42)
    this.resetCPU();
    this.cpu._setHL(0x2000);
    this.cpu._setBC(0x1000);
    this.setFlags(false, false, false, false, false, true); // Set carry flag
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x42);
    
    this.cpu.step();
    this.assert(this.cpu._getHL() === 0x0FFF, 'SBC HL,BC: HL = 0x2000 - 0x1000 - carry = 0x0FFF');
    this.assert((this.cpu.F & 0x01) === 0, 'SBC HL,BC: Carry flag cleared');
    
    // Test SBC HL,SP (0xED72)
    this.resetCPU();
    this.cpu._setHL(0x1000);
    this.cpu.SP = 0x2000;
    this.setFlags(false, false, false, false, false, false); // No carry
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x72);
    
    this.cpu.step();
    this.assert(this.cpu._getHL() === 0xF000, 'SBC HL,SP: HL = 0x1000 - 0x2000 = 0xF000 (negative result)');
    this.assert((this.cpu.F & 0x80) !== 0, 'SBC HL,SP: Sign flag set for negative result');
  }

  // Test 16-bit INC/DEC operations
  test16bit_INC_DEC() {
    console.log('\n=== Testing 16-bit INC/DEC Operations ===');
    
    // Test INC BC (0x03)
    this.resetCPU();
    this.cpu._setBC(0xFFFF);
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x03);
    
    const tstates = this.cpu.step();
    this.assert(this.cpu._getBC() === 0x0000, 'INC BC: BC = 0xFFFF + 1 = 0x0000');
    this.assert(tstates === 6, 'INC BC: T-states = 6');
    
    // Test DEC DE (0x1B)
    this.resetCPU();
    this.cpu._setDE(0x0001);
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x1B);
    
    this.cpu.step();
    this.assert(this.cpu._getDE() === 0x0000, 'DEC DE: DE = 0x0001 - 1 = 0x0000');
    
    // Test INC SP (0x33)
    this.resetCPU();
    this.cpu.SP = 0xFFFF;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x33);
    
    this.cpu.step();
    this.assert(this.cpu.SP === 0x0000, 'INC SP: SP = 0xFFFF + 1 = 0x0000');
  }

  // Test ADC/SBC A,r operations
  testADC_SBC_A_operations() {
    console.log('\n=== Testing ADC/SBC A,r Operations ===');
    
    // Test ADC A,B (0x88)
    this.resetCPU();
    this.cpu.A = 0xFF;
    this.cpu.B = 0x01;
    this.setFlags(false, false, false, false, false, false); // No carry
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x88);
    
    const tstates = this.cpu.step();
    this.assert(this.cpu.A === 0x00, 'ADC A,B: A = 0xFF + 0x01 = 0x00 (with carry)');
    this.assert(tstates === 4, 'ADC A,B: T-states = 4');
    this.assert((this.cpu.F & 0x01) !== 0, 'ADC A,B: Carry flag set');
    this.assert((this.cpu.F & 0x40) !== 0, 'ADC A,B: Zero flag set');
    
    // Test SBC A,C (0x99)
    this.resetCPU();
    this.cpu.A = 0x10;
    this.cpu.C = 0x05;
    this.setFlags(false, false, false, false, false, true); // Set carry
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x99);
    
    this.cpu.step();
    this.assert(this.cpu.A === 0x0A, 'SBC A,C: A = 0x10 - 0x05 - carry = 0x0A');
    this.assert((this.cpu.F & 0x02) !== 0, 'SBC A,C: N flag set');
  }

  // Test exchange operations
  testExchange_operations() {
    console.log('\n=== Testing Exchange Operations ===');
    
    // Test EX AF,AF' (0x08)
    this.resetCPU();
    this.cpu.A = 0x12;
    this.cpu.F = 0x45;
    this.cpu.A_ = 0x34;
    this.cpu.F_ = 0x67;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x08);
    
    this.cpu.step();
    this.assert(this.cpu.A === 0x34, 'EX AF,AF\': A swapped with A\'');
    this.assert(this.cpu.F === 0x67, 'EX AF,AF\': F swapped with F\'');
    this.assert(this.cpu.A_ === 0x12, 'EX AF,AF\': A\' swapped with A');
    this.assert(this.cpu.F_ === 0x45, 'EX AF,AF\': F\' swapped with F');
    
    // Test EXX (0xD9)
    this.resetCPU();
    this.cpu._setBC(0x1234);
    this.cpu._setDE(0x5678);
    this.cpu._setHL(0x9ABC);
    this.cpu.B_ = 0xFF;
    this.cpu.C_ = 0xEE;
    this.cpu.D_ = 0xDD;
    this.cpu.E_ = 0xCC;
    this.cpu.H_ = 0xBB;
    this.cpu.L_ = 0xAA;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xD9);
    
    this.cpu.step();
    this.assert(this.cpu._getBC() === 0xFFEE, 'EXX: BC swapped with BC\'');
    this.assert(this.cpu._getDE() === 0xDDCC, 'EXX: DE swapped with DE\'');
    this.assert(this.cpu._getHL() === 0xBBAA, 'EXX: HL swapped with HL\'');
    this.assert(this.cpu.B === 0x12, 'EXX: B swapped with B\'');
    this.assert(this.cpu.C === 0x34, 'EXX: C swapped with C\'');
  }

  // Test block memory operations
  testBlockMemory_operations() {
    console.log('\n=== Testing Block Memory Operations ===');
    
    // Test LDI (0xEDA0)
    this.resetCPU();
    this.cpu._setHL(0x1000);
    this.cpu._setDE(0x2000);
    this.cpu._setBC(0x0003);
    this.memory.write(0x1000, 0xAB);
    this.memory.write(0x1001, 0xCD);
    this.memory.write(0x1002, 0xEF);
    this.cpu.PC = 0x3000;
    this.memory.write(0x3000, 0xED);
    this.memory.write(0x3001, 0xA0);
    
    this.cpu.step();
    this.assert(this.memory.read(0x2000) === 0xAB, 'LDI: Transferred byte from (HL) to (DE)');
    this.assert(this.cpu._getHL() === 0x1001, 'LDI: HL incremented');
    this.assert(this.cpu._getDE() === 0x2001, 'LDI: DE incremented');
    this.assert(this.cpu._getBC() === 0x0002, 'LDI: BC decremented');
    this.assert((this.cpu.F & 0x04) !== 0, 'LDI: P/V flag set (BC ≠ 0)');
    
    // Test LDIR (0xEDB0) - repeat operation
    this.resetCPU();
    this.cpu._setHL(0x1000);
    this.cpu._setDE(0x2000);
    this.cpu._setBC(0x0002);
    this.memory.write(0x1000, 0x11);
    this.memory.write(0x1001, 0x22);
    this.cpu.PC = 0x3000;
    this.memory.write(0x3000, 0xED);
    this.memory.write(0x3001, 0xB0);
    
    const tstates = this.cpu.step();
    this.assert(this.memory.read(0x2000) === 0x11, 'LDIR: First byte transferred');
    this.assert(this.memory.read(0x2001) === 0x22, 'LDIR: Second byte transferred');
    this.assert(this.cpu._getBC() === 0x0000, 'LDIR: BC reached zero (stopped)');
    this.assert((this.cpu.F & 0x40) !== 0, 'LDIR: Z flag set when BC = 0');
    this.assert(tstates === 21, 'LDIR: Repeat operation takes 21 t-states');
  }

  // Test block compare operations
  testBlockCompare_operations() {
    console.log('\n=== Testing Block Compare Operations ===');
    
    // Test CPI (0xEDA1)
    this.resetCPU();
    this.cpu.A = 0x42;
    this.cpu._setHL(0x1000);
    this.cpu._setBC(0x0003);
    this.memory.write(0x1000, 0x42);  // Match
    this.memory.write(0x1001, 0x11);
    this.cpu.PC = 0x2000;
    this.memory.write(0x2000, 0xED);
    this.memory.write(0x2001, 0xA1);
    
    this.cpu.step();
    this.assert(this.cpu._getHL() === 0x1001, 'CPI: HL incremented');
    this.assert(this.cpu._getBC() === 0x0002, 'CPI: BC decremented');
    this.assert((this.cpu.F & 0x40) !== 0, 'CPI: Z flag set when A = (HL)');
    this.assert((this.cpu.F & 0x02) !== 0, 'CPI: N flag set (compare operation)');
    
    // Test CPD (0xEDA9)
    this.resetCPU();
    this.cpu.A = 0x99;
    this.cpu._setHL(0x1002);
    this.cpu._setBC(0x0003);
    this.memory.write(0x1002, 0x77);  // No match
    this.cpu.PC = 0x2000;
    this.memory.write(0x2000, 0xED);
    this.memory.write(0x2001, 0xA9);
    
    this.cpu.step();
    this.assert(this.cpu._getHL() === 0x1001, 'CPD: HL decremented');
    this.assert(this.cpu._getBC() === 0x0002, 'CPD: BC decremented');
    this.assert((this.cpu.F & 0x40) === 0, 'CPD: Z flag cleared when A ≠ (HL)');
  }

  // Test interrupt management operations
  testInterrupt_operations() {
    console.log('\n=== Testing Interrupt Management Operations ===');
    
    // Test EI (0xFB)
    this.resetCPU();
    this.cpu.IFF1 = false;
    this.cpu.IFF2 = false;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xFB);
    
    this.cpu.step();
    this.assert(this.cpu.IFF1 === true, 'EI: IFF1 enabled');
    this.assert(this.cpu.IFF2 === true, 'EI: IFF2 enabled');
    
    // Test DI (0xF3)
    this.resetCPU();
    this.cpu.IFF1 = true;
    this.cpu.IFF2 = true;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xF3);
    
    this.cpu.step();
    this.assert(this.cpu.IFF1 === false, 'DI: IFF1 disabled');
    this.assert(this.cpu.IFF2 === false, 'DI: IFF2 disabled');
    
    // Test IM 0 (0xED46)
    this.resetCPU();
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x46);
    
    this.cpu.step();
    this.assert(this.cpu.IM === 0, 'IM 0: Interrupt mode set to 0');
    
    // Test IM 1 (0xED56)
    this.resetCPU();
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x56);
    
    this.cpu.step();
    this.assert(this.cpu.IM === 1, 'IM 1: Interrupt mode set to 1');
    
    // Test IM 2 (0xED5E)
    this.resetCPU();
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x2001, 0x5E);
    
    this.cpu.step();
    this.assert(this.cpu.IM === 2, 'IM 2: Interrupt mode set to 2');
  }

  // Test system operations
  testSystem_operations() {
    console.log('\n=== Testing System Operations ===');
    
    // Test NEG (0xED44)
    this.resetCPU();
    this.cpu.A = 0x42;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x44);
    
    this.cpu.step();
    this.assert(this.cpu.A === 0xBE, 'NEG: A = 0x42 → 0xBE (two\'s complement)');
    this.assert((this.cpu.F & 0x80) !== 0, 'NEG: Sign flag set for negative result');
    this.assert((this.cpu.F & 0x02) !== 0, 'NEG: N flag set');
    
    // Test LD I,A (0xED47)
    this.resetCPU();
    this.cpu.A = 0xAB;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x47);
    
    this.cpu.step();
    this.assert(this.cpu.I === 0xAB, 'LD I,A: I register loaded from A');
    
    // Test LD A,I (0xED57)
    this.resetCPU();
    this.cpu.I = 0xCD;
    this.cpu.IFF2 = true;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0xED);
    this.memory.write(0x1001, 0x57);
    
    this.cpu.step();
    this.assert(this.cpu.A === 0xCD, 'LD A,I: A loaded from I register');
    this.assert((this.cpu.F & 0x04) !== 0, 'LD A,I: P/V flag = IFF2');
    
    // Test CPL (0x2F)
    this.resetCPU();
    this.cpu.A = 0xAB;
    this.cpu.PC = 0x1000;
    this.memory.write(0x1000, 0x2F);
    
    this.cpu.step();
    this.assert(this.cpu.A === 0x54, 'CPL: A = 0xAB → 0x54 (bitwise NOT)');
    this.assert((this.cpu.F & 0x10) !== 0, 'CPL: H flag set');
    this.assert((this.cpu.F & 0x02) !== 0, 'CPL: N flag set');
  }

  // Run all tests
  runAllTests() {
    console.log('🧪 Z80 Phase 2 Operations Test Suite');
    console.log('=====================================');
    
    this.testADC_HL_operations();
    this.testSBC_HL_operations();
    this.test16bit_INC_DEC();
    this.testADC_SBC_A_operations();
    this.testExchange_operations();
    this.testBlockMemory_operations();
    this.testBlockCompare_operations();
    this.testInterrupt_operations();
    this.testSystem_operations();
    
    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    console.log(`Total Tests: ${this.testsRun}`);
    console.log(`Passed: ${this.testsPassed} ✅`);
    console.log(`Failed: ${this.testsFailed} ❌`);
    console.log(`Success Rate: ${((this.testsPassed / this.testsRun) * 100).toFixed(1)}%`);
    
    if (this.testsFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Phase 2 implementation is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the implementation.');
    }
    
    return this.testsFailed === 0;
  }
}

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new Z80Phase2Test();
  const success = tester.runAllTests();
  process.exit(success ? 0 : 1);
}

export { Z80Phase2Test };