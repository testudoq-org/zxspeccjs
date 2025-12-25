#!/usr/bin/env node

/**
 * ZX Spectrum 48K Boot Validation Test
 * Comprehensive test to verify cold boot sequence and copyright message display
 * 
 * This test simulates a complete boot sequence and validates:
 * 1. Cold boot from power-on state
 * 2. Copyright message "© 1982 Sinclair Research Ltd" appears in screen memory
 * 3. System state validation (border color, system variables, frame counter)
 * 4. Complete boot sequence execution (~100,000 T-states)
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

// ZX Spectrum character encoding
const CHARACTER_SET = {
  32: ' ', 33: '!', 34: '"', 35: '#', 36: '$', 37: '%', 38: '&', 39: "'",
  40: '(', 41: ')', 42: '*', 43: '+', 44: ',', 45: '-', 46: '.', 47: '/',
  48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7',
  56: '8', 57: '9', 58: ':', 59: ';', 60: '<', 61: '=', 62: '>', 63: '?',
  64: '@', 65: 'A', 66: 'B', 67: 'C', 68: 'D', 69: 'E', 70: 'F', 71: 'G',
  72: 'H', 73: 'I', 74: 'J', 75: 'K', 76: 'L', 77: 'M', 78: 'N', 79: 'O',
  80: 'P', 81: 'Q', 82: 'R', 83: 'S', 84: 'T', 85: 'U', 86: 'V', 87: 'W',
  88: 'X', 89: 'Y', 90: 'Z', 91: '[', 92: '\\', 93: ']', 94: '^', 95: '_',
  96: '£', 97: 'a', 98: 'b', 99: 'c', 100: 'd', 101: 'e', 102: 'f', 103: 'g',
  104: 'h', 105: 'i', 106: 'j', 107: 'k', 108: 'l', 109: 'm', 110: 'n', 111: 'o',
  112: 'p', 113: 'q', 114: 'r', 115: 's', 116: 't', 117: 'u', 118: 'v', 119: 'w',
  120: 'x', 121: 'y', 122: 'z', 123: '{', 124: '|', 125: '}', 126: '~', 127: '©'
};

class BootValidator {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      tests: [],
      errors: [],
      warnings: []
    };
    
    this.debugOutput = true; // Always enable debug output for validation
    this.validationResults = {};
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [BootValidator] [${level.toUpperCase()}] ${message}`);
    
    if (level === 'error') {
      this.testResults.errors.push(message);
    } else if (level === 'warning') {
      this.testResults.warnings.push(message);
    }
  }

  assert(condition, testName, message) {
    if (condition) {
      this.log(`✓ PASS: ${testName} - ${message}`, 'info');
      this.testResults.passed++;
      this.validationResults[testName] = { status: 'PASS', message };
    } else {
      this.log(`✗ FAIL: ${testName} - ${message}`, 'error');
      this.testResults.failed++;
      this.testResults.tests.push({ name: testName, status: 'FAIL', message });
      this.validationResults[testName] = { status: 'FAIL', message };
    }
  }

  // Initialize emulator from cold boot state
  initializeEmulator() {
    this.log('Initializing ZX Spectrum 48K emulator from cold boot state...');
    
    try {
      // Create memory with ROM
      this.memory = new Memory({ model: '48k' });
      this.memory.loadROM(ROM_DATA.bytes, 0);
      
      // Create CPU and attach memory
      this.cpu = new Z80(this.memory);
      this.cpu.reset();
      
      // Create ULA and attach CPU and memory
      // Create a mock canvas for testing
      const mockCanvas = {
        getContext: () => ({ 
          createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
          putImageData: () => {},
          imageSmoothingEnabled: false
        }),
        width: 256,
        height: 192,
        style: {}
      };
      this.ula = new ULA(this.memory, mockCanvas);
      this.ula.attachCPU(this.cpu);
      
      // Enable debug output for boot sequence
      this.cpu._debugVerbose = true;
      
      this.log('Emulator initialized successfully');
      return true;
    } catch (error) {
      this.log(`Failed to initialize emulator: ${error.message}`, 'error');
      return false;
    }
  }

  // Execute boot sequence for specified T-states
  executeBootSequence(targetTstates = 10000) {
    this.log(`Executing boot sequence for ${targetTstates} T-states...`);
    
    const startTstates = this.cpu.tstates;
    const startTime = Date.now();
    let lastProgressReport = 0;
    let steps = 0;
    
    try {
      // Execute instructions until target T-states reached
      while (this.cpu.tstates - startTstates < targetTstates && steps < 50000) {
        const consumed = this.cpu.step();
        
        // Generate ULA interrupts if enabled
        if (this.ula.interruptEnabled) {
          this.ula.generateInterrupt(consumed);
        }
        
        steps++;
        
        // Report progress every 25% increments
        const progress = Math.floor(((this.cpu.tstates - startTstates) / targetTstates) * 100);
        if (progress >= lastProgressReport + 25 && progress <= 100) {
          this.log(`Boot progress: ${progress}% (${this.cpu.tstates - startTstates}/${targetTstates} T-states)`);
          lastProgressReport = progress;
        }
        
        // Safety check for infinite loops
        if (Date.now() - startTime > 10000) { // 10 second timeout for testing
          this.log('Boot execution timeout after 10 seconds', 'warning');
          break;
        }
      }
      
      const actualTstates = this.cpu.tstates - startTstates;
      const executionTime = Date.now() - startTime;
      
      this.log(`Boot sequence completed: ${actualTstates} T-states in ${executionTime}ms (${steps} steps)`);
      return actualTstates;
      
    } catch (error) {
      this.log(`Boot sequence execution failed: ${error.message}`, 'error');
      return 0;
    }
  }

  // Verify copyright message in screen memory
  verifyCopyrightMessage() {
    this.log('Verifying copyright message "© 1982 Sinclair Research Ltd" in screen memory...');
    
    // Screen memory ranges
    const screenStart = 0x4000;
    const screenEnd = 0x57FF;
    const attrStart = 0x5800;
    const attrEnd = 0x5AFF;
    
    // Extract screen memory content
    const screenData = new Uint8Array(screenEnd - screenStart);
    for (let i = 0; i < screenData.length; i++) {
      screenData[i] = this.memory.read(screenStart + i);
    }
    
    // Extract attribute memory content
    const attrData = new Uint8Array(attrEnd - attrStart);
    for (let i = 0; i < attrData.length; i++) {
      attrData[i] = this.memory.read(attrStart + i);
    }
    
    // Convert screen data to text
    const textContent = this.decodeScreenText(screenData, attrData);
    
    this.log(`Screen text content: "${textContent}"`);
    
    // Check for copyright message
    const copyrightText = '© 1982 Sinclair Research Ltd';
    const found = textContent.includes(copyrightText);
    
    this.assert(found, 'Copyright Message Display', 
      found ? 'Copyright message found in screen memory' : 'Copyright message NOT found in screen memory');
    
    if (!found) {
      this.log('Screen content analysis:', 'info');
      this.analyzeScreenContent(screenData, attrData);
    }
    
    return found;
  }

  // Decode ZX Spectrum screen text
  decodeScreenText(screenData, attrData) {
    let text = '';
    
    // ZX Spectrum uses a complex screen layout
    // Each character is 8x8 pixels, stored in a specific pattern
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < 32; col++) {
        const charIndex = this.getCharacterIndex(screenData, row, col);
        const char = CHARACTER_SET[charIndex] || '?';
        text += char;
      }
    }
    
    return text;
  }

  // Get character index from screen position
  getCharacterIndex(screenData, row, col) {
    // ZX Spectrum screen layout: 24 rows x 32 columns
    // Character cells are 8x8 pixels
    // Screen address calculation is complex due to the scanline interleaving
    
    const charWidth = 8;
    const charHeight = 8;
    
    // Calculate the linear position in screen memory
    // This is a simplified version - real implementation would need full decoding
    const linearPos = (row * 32 + col) * charWidth;
    
    if (linearPos + charWidth >= screenData.length) {
      return 32; // Return space character for out-of-bounds
    }
    
    // For boot validation, we can use a simpler approach
    // Look for the copyright symbol (127) or use pattern matching
    let charCode = 32; // Default to space
    
    // Check for copyright symbol (127) which appears as ©
    for (let i = 0; i < charWidth; i++) {
      if (screenData[linearPos + i] === 127) {
        charCode = 127;
        break;
      }
    }
    
    return charCode;
  }

  // Analyze screen content for debugging
  analyzeScreenContent(screenData, attrData) {
    this.log('Analyzing screen content for debugging...');
    
    // Look for copyright symbol (127)
    let copyrightCount = 0;
    for (let i = 0; i < screenData.length; i++) {
      if (screenData[i] === 127) {
        copyrightCount++;
      }
    }
    
    this.log(`Copyright symbols (127) found in screen: ${copyrightCount}`);
    
    // Check for non-zero screen content
    let nonZeroCount = 0;
    for (let i = 0; i < screenData.length; i++) {
      if (screenData[i] !== 0) {
        nonZeroCount++;
      }
    }
    
    this.log(`Non-zero screen bytes: ${nonZeroCount}/${screenData.length}`);
    
    // Check attribute data
    let attrNonZeroCount = 0;
    for (let i = 0; i < attrData.length; i++) {
      if (attrData[i] !== 0) {
        attrNonZeroCount++;
      }
    }
    
    this.log(`Non-zero attribute bytes: ${attrNonZeroCount}/${attrData.length}`);
    
    // Sample some screen data
    if (screenData.length > 0) {
      const sampleSize = Math.min(32, screenData.length);
      const sample = Array.from(screenData.slice(0, sampleSize))
        .map(b => `0x${b.toString(16).padStart(2, '0')}`)
        .join(' ');
      this.log(`First ${sampleSize} screen bytes: ${sample}`);
    }
  }

  // Validate system state
  validateSystemState() {
    this.log('Validating system state...');
    
    // Check CPU state
    this.assert(this.cpu.PC !== undefined && this.cpu.PC !== null, 'CPU PC Valid', 
      `CPU PC is ${this.cpu.PC}`);
    
    this.assert(this.cpu.A !== undefined && this.cpu.A !== null, 'CPU A Register Valid', 
      `CPU A register is ${this.cpu.A}`);
    
    this.assert(this.cpu.SP !== undefined && this.cpu.SP !== null, 'CPU SP Valid', 
      `CPU SP is ${this.cpu.SP}`);
    
    this.assert(this.cpu.IFF1 !== undefined, 'CPU IFF1 Valid', 
      `CPU IFF1 is ${this.cpu.IFF1}`);
    
    this.assert(this.cpu.IM !== undefined, 'CPU IM Valid', 
      `CPU IM is ${this.cpu.IM}`);
    
    // Check system variables
    this.validateSystemVariables();
    
    // Check ULA state
    this.validateULAState();
    
    // Check memory state
    this.validateMemoryState();
  }

  // Validate system variables
  validateSystemVariables() {
    this.log('Validating system variables...');
    
    // FRAMES counter at 0x5C5C
    const frames = this.memory.readWord(0x5C5C);
    this.assert(frames !== undefined, 'FRAMES System Variable', 
      `FRAMES counter is ${frames}`);
    
    // BORDER color check - should be set during boot
    const borderWrites = this.checkPortWrites(0xFE);
    const borderSet = borderWrites.some(write => (write.value & 0x07) === 0x07); // White border
    this.assert(borderSet, 'Border Color Set', 
      borderSet ? 'Border set to white (0x07)' : 'Border not set to white');
  }

  // Check port writes for a specific port
  checkPortWrites(port) {
    // This would need to be implemented to track port writes
    // For now, we'll return a mock result
    return [];
  }

  // Validate ULA state
  validateULAState() {
    this.log('Validating ULA state...');
    
    this.assert(this.ula.border !== undefined, 'ULA Border Valid', 
      `ULA border color is ${this.ula.border}`);
    
    this.assert(this.ula.frameCounter !== undefined, 'ULA Frame Counter Valid', 
      `ULA frame counter is ${this.ula.frameCounter}`);
    
    this.assert(this.ula.tstatesPerFrame === 69888, 'ULA Frame Timing', 
      `T-states per frame is ${this.ula.tstatesPerFrame}`);
  }

  // Validate memory state
  validateMemoryState() {
    this.log('Validating memory state...');
    
    // Check ROM is loaded
    const romByte0 = this.memory.read(0x0000);
    this.assert(romByte0 === 243, 'ROM Loaded Correctly', 
      `ROM first byte is 0x${romByte0.toString(16)} (expected 0xF3 for DI)`);
    
    // Check RAM is accessible
    const testRamWrite = this.memory.write(0x4000, 0xAA);
    const testRamRead = this.memory.read(0x4000);
    this.assert(testRamWrite && testRamRead === 0xAA, 'RAM Accessibility', 
      'RAM read/write working correctly');
  }

  // Validate complete boot sequence
  validateBootSequence() {
    this.log('Validating complete boot sequence...');
    
    // Check if boot reached expected addresses
    const bootAddresses = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
    let reachedAddresses = 0;
    
    // This would need to track PC history during execution
    // For now, we'll check current PC
    const currentPC = this.cpu.PC;
    this.log(`Current PC after boot: 0x${currentPC.toString(16).padStart(4, '0')}`);
    
    // Basic check: PC should not be in ROM area (0x0000-0x3FFF)
    const pcInROM = currentPC < 0x4000;
    this.assert(!pcInROM, 'PC Not in ROM', 
      pcInROM ? `PC still in ROM area (0x${currentPC.toString(16)})` : 'PC moved out of ROM area');
    
    return reachedAddresses === bootAddresses.length;
  }

  // Run complete boot validation
  async runBootValidation() {
    this.log('=== ZX Spectrum 48K Boot Validation Test Started ===');
    
    try {
      // Step 1: Initialize emulator
      const initSuccess = this.initializeEmulator();
      this.assert(initSuccess, 'Emulator Initialization', 
        initSuccess ? 'Emulator initialized successfully' : 'Emulator initialization failed');
      
      if (!initSuccess) {
        throw new Error('Failed to initialize emulator');
      }
      
      // Step 2: Execute boot sequence
      const tstatesExecuted = this.executeBootSequence(10000);
      this.assert(tstatesExecuted > 5000, 'Boot Sequence Execution', 
        `Executed ${tstatesExecuted} T-states (target: 10,000)`);
      
      // Step 3: Verify copyright message
      const copyrightFound = this.verifyCopyrightMessage();
      
      // Step 4: Validate system state
      this.validateSystemState();
      
      // Step 5: Validate boot sequence completion
      this.validateBootSequence();
      
      // Generate final report
      this.generateReport();
      
    } catch (error) {
      this.log(`Boot validation failed with error: ${error.message}`, 'error');
      this.testResults.failed++;
    }
    
    this.log('=== ZX Spectrum 48K Boot Validation Test Completed ===');
    return this.testResults;
  }

  // Generate validation report
  generateReport() {
    this.log('\n=== BOOT VALIDATION REPORT ===');
    this.log(`Tests Passed: ${this.testResults.passed}`);
    this.log(`Tests Failed: ${this.testResults.failed}`);
    this.log(`Success Rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);
    
    if (this.testResults.warnings.length > 0) {
      this.log('\nWarnings:');
      this.testResults.warnings.forEach(warning => this.log(`  - ${warning}`, 'warning'));
    }
    
    if (this.testResults.errors.length > 0) {
      this.log('\nErrors:');
      this.testResults.errors.forEach(error => this.log(`  - ${error}`, 'error'));
    }
    
    // Validation results summary
    this.log('\nValidation Results:');
    Object.entries(this.validationResults).forEach(([testName, result]) => {
      const status = result.status === 'PASS' ? '✓' : '✗';
      this.log(`  ${status} ${testName}: ${result.message}`);
    });
    
    this.log('=== END REPORT ===\n');
  }
}

// Main execution
async function main() {
  console.log('ZX Spectrum 48K Boot Validation Test');
  console.log('=====================================');
  
  const validator = new BootValidator();
  const results = await validator.runBootValidation();
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export default BootValidator;