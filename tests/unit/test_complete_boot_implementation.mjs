/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Comprehensive test for ZX Spectrum 48K boot implementation
// Tests all critical fixes: I register, 50Hz interrupts, frame counter, I/O channels

import spec48 from '../../src/roms/spec48.js';
import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';
import { ULA } from '../../src/ula.mjs';

console.log('=== ZX Spectrum 48K Boot Implementation Test ===\n');

// Create mock canvas for ULA
class MockCanvas {
  constructor() {
    this.width = 256;
    this.height = 192;
    this.style = {};
  }
  
  getContext() {
    return {
      createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
      putImageData: () => {},
      imageSmoothingEnabled: false
    };
  }
}

function testCPUReset() {
  console.log('TEST 1: CPU Reset with I Register Fix');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  const cpu = new Z80(memory);
  
  // Reset CPU
  cpu.reset();
  
  // Verify I register is set to 0x3F
  const iRegister = cpu.I;
  const success = iRegister === 0x3F;
  
  console.log(`✓ I register after reset: 0x${iRegister.toString(16).padStart(2, '0')} (expected: 0x3F)`);
  console.log(`✓ CPU reset test: ${success ? 'PASSED' : 'FAILED'}\n`);
  
  return success;
}

function testFrameCounter() {
  console.log('TEST 2: Frame Counter Implementation');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  const canvas = new MockCanvas();
  const ula = new ULA(memory, canvas);
  const cpu = new Z80(memory);
  
  // Connect ULA to CPU
  ula.attachCPU(cpu);
  
  // Enable interrupts so frame counter increments
  cpu.IFF1 = true;
  cpu.IFF2 = true;
  ula.updateInterruptState();
  
  // Initialize frame counter
  ula.frameCounter = 0;
  
  // Initialize I/O system to set up system variables
  memory.attachCPU(cpu);
  cpu.io = {
    write: () => {},
    read: () => 0xFF
  };
  
  // Simulate frame counter updates
  const testFrames = 5;
  for (let i = 1; i <= testFrames; i++) {
    ula.generateInterrupt(69888); // Full frame worth of t-states
    
    // Check if frame counter was updated
    const frames = ula.frameCounter;
    console.log(`✓ Frame ${i}: counter = ${frames}`);
    
    // Verify counter increment
    if (frames !== i) {
      console.log(`✗ Frame counter error: expected ${i}, got ${frames}`);
      return false;
    }
  }
  
  console.log('✓ Frame counter test: PASSED\n');
  return true;
}

function testInterruptGeneration() {
  console.log('TEST 3: 50Hz Interrupt Generation');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  const canvas = new MockCanvas();
  const ula = new ULA(memory, canvas);
  const cpu = new Z80(memory);
  
  // Connect ULA to CPU
  ula.attachCPU(cpu);
  
  // Enable interrupts
  cpu.IFF1 = true;
  cpu.IFF2 = true;
  
  // Update interrupt state
  ula.updateInterruptState();
  
  console.log(`✓ Interrupt enabled: ${ula.interruptEnabled}`);
  console.log(`✓ CPU IFF1: ${cpu.IFF1}`);
  console.log(`✓ CPU IFF2: ${cpu.IFF2}`);
  
  // Generate interrupt
  const interruptRequestedBefore = cpu.intRequested;
  ula.generateInterrupt(69888); // Full frame
  
  const interruptRequestedAfter = cpu.intRequested;
  console.log(`✓ Interrupt requested: ${interruptRequestedAfter}`);
  
  const success = interruptRequestedAfter && !interruptRequestedBefore;
  console.log(`✓ Interrupt generation test: ${success ? 'PASSED' : 'FAILED'}\n`);
  
  return success;
}

function testIOSystem() {
  console.log('TEST 4: I/O Channel System');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  const cpu = new Z80(memory);
  
  // Test CHANS table initialization
  const chans = memory.read(0x5C36);
  const curchl = memory.readWord(0x5C37);
  
  console.log(`✓ CHANS at 0x5C36: 0x${chans.toString(16).padStart(2, '0')} (expected: 0x4B for 'K')`);
  console.log(`✓ CURCHL at 0x5C37: 0x${curchl.toString(16).padStart(4, '0')} (expected: 0x5C39)`);
  
  // Test RST 0x10 (CHAN_OPEN)
  const originalA = cpu.A;
  cpu.A = 0; // Channel 0 (screen)
  
  // Call CHAN_OPEN handler
  cpu._handleChanOpen();
  
  // Verify CURCHL was set correctly
  const newCurchl = memory.readWord(0x5C37);
  const expectedCurchl = 0x5C39; // Screen channel address
  
  const success = newCurchl === expectedCurchl;
  console.log(`✓ CHAN_OPEN test: ${success ? 'PASSED' : 'FAILED'}`);
  console.log(`✓ CURCHL after CHAN_OPEN: 0x${newCurchl.toString(16).padStart(4, '0')} (expected: 0x${expectedCurchl.toString(16).padStart(4, '0')})\n`);
  
  // Restore A register to its original value
  cpu.A = originalA;
  return success;
}

function testBootSequence() {
  console.log('TEST 5: Complete Boot Sequence');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  const canvas = new MockCanvas();
  const ula = new ULA(memory, canvas);
  const cpu = new Z80(memory);
  
  // Connect components
  memory.attachCPU(cpu);
  ula.attachCPU(cpu);
  
  // Reset CPU (this now sets I register to 0x3F)
  cpu.reset();
  
  console.log('✓ CPU reset completed');
  console.log(`✓ I register: 0x${cpu.I.toString(16).padStart(2, '0')}`);
  console.log(`✓ Initial PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  
  // Enable interrupts (required for boot sequence)
  cpu.IFF1 = true;
  cpu.IFF2 = true;
  
  // Run boot sequence for several frames
  const maxFrames = 10;
  let bootComplete = false;
  
  for (let frame = 1; frame <= maxFrames; frame++) {
    console.log(`\n--- Frame ${frame} ---`);
    
    // Run CPU for one frame worth of t-states
    const tstatesBefore = cpu.tstates;
    cpu.runFor(69888);
    const tstatesExecuted = cpu.tstates - tstatesBefore;
    
    // Generate interrupt based on t-states
    ula.generateInterrupt(tstatesExecuted);
    ula.updateInterruptState();
    
    console.log(`✓ T-states executed: ${tstatesExecuted}`);
    console.log(`✓ Frame counter: ${ula.frameCounter}`);
    console.log(`✓ Current PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`✓ Interrupt requested: ${cpu.intRequested}`);
    
    // Check for boot completion (reaching final boot address)
    if (cpu.PC === 0x11CB) {
      bootComplete = true;
      console.log('🎉 BOOT SEQUENCE COMPLETED!');
      break;
    }
    
    // Stop if CPU has crashed or is stuck
    if (frame > 3 && cpu.PC === 0x0000) {
      console.log('⚠️ CPU returned to reset vector - possible crash');
      break;
    }
  }
  
  console.log(`\n✓ Boot sequence test: ${bootComplete ? 'COMPLETED' : 'INCOMPLETE'}`);
  return bootComplete;
}

function testCopyrightDisplay() {
  console.log('\nTEST 6: Copyright Message Display');
  
  const memory = new Memory({ romBuffer: spec48.bytes });
  
  // Check if copyright message exists in ROM at expected location
  // From analysis: "© 1982 Sinclair Research Ltd" should be at ROM address 0x153B
  const copyrightAddr = 0x153B;
  
  let copyrightFound = false;
  let copyrightText = '';
  
  // Read characters until we find the copyright message or reach end
  for (let i = 0; i < 100; i++) {
    const addr = (copyrightAddr + i) & 0xFFFF;
    const char = memory.read(addr);
    
    if (char === 0) break; // End of string
    
    if (char >= 32 && char <= 126) { // Printable ASCII
      copyrightText += String.fromCharCode(char);
      
      // Check for copyright symbol and "1982"
      if (copyrightText.includes('©') || copyrightText.includes('1982')) {
        copyrightFound = true;
        break;
      }
    }
  }
  
  console.log(`✓ ROM copyright text found: "${copyrightText}"`);
  console.log(`✓ Copyright message test: ${copyrightFound ? 'PASSED' : 'FOUND BUT INCOMPLETE'}`);
  
  return copyrightFound;
}

import { test, expect } from 'vitest';

// Run all tests under a Vitest test so failures are reported as test failures
test('complete boot implementation tests', () => {
  const tests = [
    testCPUReset,
    testFrameCounter,
    testInterruptGeneration,
    testIOSystem,
    testBootSequence,
    testCopyrightDisplay
  ];

  let passedTests = 0;
  let totalTests = tests.length;

  for (const t of tests) {
    const result = t();
    if (result) passedTests++;
  }

  console.log('=== TEST RESULTS ===');
  console.log(`Passed: ${passedTests}/${totalTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);

  expect(passedTests).toBe(totalTests);
});
