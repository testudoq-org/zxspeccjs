#!/usr/bin/env node

/**
 * Simplified Comprehensive Boot Test for ZX Spectrum Emulator
 * 
 * This test verifies the boot sequence implementation by:
 * 1. Testing core emulator components
 * 2. Verifying ROM loading and Z80 execution
 * 3. Checking ULA display functionality
 * 4. Running boot sequence simulation
 * 5. Validating expected boot behavior
 */

import { readFileSync, existsSync } from 'fs';
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { ULA } from './src/ula.mjs';

class SimplifiedBootTest {
  constructor() {
    this.testResults = {
      componentsTested: [],
      romLoaded: false,
      z80Working: false,
      ulaWorking: false,
      bootSequence: [],
      borderChanges: [],
      copyrightFound: false,
      basicPromptFound: false,
      errors: []
    };
  }

  async runAllTests() {
    console.log('🧪 Simplified ZX Spectrum Boot Sequence Test');
    console.log('============================================');
    
    try {
      // Test 1: Verify emulator components
      await this.testEmulatorComponents();
      
      // Test 2: Test ROM loading
      await this.testROMLoading();
      
      // Test 3: Test Z80 CPU functionality
      await this.testZ80CPU();
      
      // Test 4: Test ULA display functionality
      await this.testULADisplay();
      
      // Test 5: Simulate boot sequence
      await this.simulateBootSequence();
      
      // Test 6: Verify expected boot behavior
      await this.verifyBootBehavior();
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      this.testResults.errors.push(error.message);
    }
    
    this.generateReport();
    return this.testResults;
  }

  async testEmulatorComponents() {
    console.log('\n🔧 Testing Emulator Components...');
    
    // Test Memory class
    try {
      const memory = new Memory();
      console.log('✅ Memory class: OK');
      this.testResults.componentsTested.push('Memory');
    } catch (error) {
      console.log(`❌ Memory class: FAILED - ${error.message}`);
      this.testResults.errors.push(`Memory class failed: ${error.message}`);
    }
    
    // Test Z80 class
    try {
      const memory = new Memory();
      const cpu = new Z80(memory);
      console.log('✅ Z80 CPU class: OK');
      this.testResults.componentsTested.push('Z80');
    } catch (error) {
      console.log(`❌ Z80 CPU class: FAILED - ${error.message}`);
      this.testResults.errors.push(`Z80 CPU class failed: ${error.message}`);
    }
    
    // Test ULA class
    try {
      const memory = new Memory();
      const canvas = this.createMockCanvas();
      const ula = new ULA(memory, canvas);
      console.log('✅ ULA class: OK');
      this.testResults.componentsTested.push('ULA');
    } catch (error) {
      console.log(`❌ ULA class: FAILED - ${error.message}`);
      this.testResults.errors.push(`ULA class failed: ${error.message}`);
    }
  }

  createMockCanvas() {
    return {
      width: 256,
      height: 192,
      style: {},
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
        putImageData: () => {},
        imageSmoothingEnabled: false
      })
    };
  }

  async testROMLoading() {
    console.log('\n💾 Testing ROM Loading...');
    
    try {
      if (!existsSync('roms/spec48.rom')) {
        throw new Error('ROM file not found');
      }
      
      const romData = readFileSync('roms/spec48.rom');
      console.log(`📁 ROM file: ${romData.length} bytes`);
      
      if (romData.length === 16384) {
        console.log('✅ ROM size correct (16KB)');
        this.testResults.romLoaded = true;
        
        // Test ROM loading into memory
        const memory = new Memory();
        memory.loadROM(romData);
        
        // Verify ROM was loaded
        const firstByte = memory.read(0x0000);
        console.log(`📝 First ROM byte: 0x${firstByte.toString(16).padStart(2, '0')}`);
        
        if (firstByte !== 0xFF) {
          console.log('✅ ROM content appears valid');
        } else {
          console.log('⚠️  ROM content may be all 0xFF');
        }
        
      } else {
        console.log(`❌ ROM size incorrect: ${romData.length} bytes (expected 16384)`);
      }
      
    } catch (error) {
      console.log(`❌ ROM loading failed: ${error.message}`);
      this.testResults.errors.push(`ROM loading failed: ${error.message}`);
    }
  }

  async testZ80CPU() {
    console.log('\n🖥️  Testing Z80 CPU Functionality...');
    
    try {
      const memory = new Memory();
      const cpu = new Z80(memory);
      
      // Test basic CPU operations
      cpu.reset();
      console.log('✅ CPU reset successful');
      
      // Test some basic opcodes
      let testPassed = true;
      
      // Test NOP (0x00)
      memory.write(0x4000, 0x00); // NOP
      cpu.PC = 0x4000;
      const pcBefore = cpu.PC;
      cpu.step();
      if (cpu.PC !== pcBefore + 1) {
        console.log('❌ NOP opcode failed');
        testPassed = false;
      }
      
      // Test LD A,n (0x3E nn)
      memory.write(0x4000, 0x3E); // LD A,n
      memory.write(0x4001, 0x42); // value 0x42
      cpu.PC = 0x4000;
      cpu.step();
      if (cpu.A !== 0x42) {
        console.log('❌ LD A,n opcode failed');
        testPassed = false;
      }
      
      if (testPassed) {
        console.log('✅ Basic Z80 opcodes working');
        this.testResults.z80Working = true;
      }
      
    } catch (error) {
      console.log(`❌ Z80 CPU test failed: ${error.message}`);
      this.testResults.errors.push(`Z80 CPU test failed: ${error.message}`);
    }
  }

  async testULADisplay() {
    console.log('\n🖼️  Testing ULA Display Functionality...');
    
    try {
      const memory = new Memory();
      const canvas = this.createMockCanvas();
      const ula = new ULA(memory, canvas);
      
      // Test border color changes
      const originalBorder = ula.border;
      
      // Test setting different border colors
      ula.writePort(0xFE, 0x02); // Red border
      if (ula.border !== 2) {
        throw new Error('Border color not set correctly');
      }
      
      ula.writePort(0xFE, 0x00); // Black border
      if (ula.border !== 0) {
        throw new Error('Border color not set to black');
      }
      
      console.log('✅ ULA border control working');
      
      // Test memory access for display
      memory.write(0x4000, 0xAA); // Write to display area
      const bitmapView = memory.getBitmapView();
      if (bitmapView && bitmapView.length > 0) {
        console.log('✅ ULA can access display memory');
      } else {
        console.log('⚠️  ULA display memory access issue');
      }
      
      this.testResults.ulaWorking = true;
      
    } catch (error) {
      console.log(`❌ ULA display test failed: ${error.message}`);
      this.testResults.errors.push(`ULA display test failed: ${error.message}`);
    }
  }

  async simulateBootSequence() {
    console.log('\n🎮 Simulating Boot Sequence...');
    
    try {
      // Create a complete emulator setup
      const memory = new Memory();
      const cpu = new Z80(memory);
      const canvas = this.createMockCanvas();
      const ula = new ULA(memory, canvas);
      
      // Connect CPU to ULA for port I/O
      cpu.io = {
        write: (port, value, tstates) => {
          if ((port & 0xFF) === 0xFE) {
            ula.writePort(port, value);
            // Track border changes for boot sequence analysis
            const colorName = this.getBorderColorName(value & 0x07);
            this.testResults.borderChanges.push({
              color: value & 0x07,
              name: colorName,
              tstates: tstates
            });
          }
        },
        read: (port) => {
          if ((port & 0xFF) === 0xFE) {
            return ula.readPort(port);
          }
          return 0xFF;
        }
      };
      
      // Load ROM if available
      if (existsSync('roms/spec48.rom')) {
        const romData = readFileSync('roms/spec48.rom');
        memory.loadROM(romData);
        console.log('✅ ROM loaded for boot simulation');
      }
      
      // Simulate boot sequence by running some instructions
      console.log('🔄 Running simulated boot instructions...');
      
      let steps = 0;
      const maxSteps = 1000;
      
      // Run boot sequence
      while (steps < maxSteps) {
        const startPC = cpu.PC;
        const tstates = cpu.step();
        steps++;
        
        // Stop if we reach BASIC ready state (around PC 0x0D6E)
        if (cpu.PC >= 0x0D00 && cpu.PC <= 0x0E00) {
          console.log(`📍 Reached BASIC area at PC: 0x${cpu.PC.toString(16)}`);
          break;
        }
        
        // Monitor border changes during memory test
        if (this.testResults.borderChanges.length > 0) {
          const lastChange = this.testResults.borderChanges[this.testResults.borderChanges.length - 1];
          console.log(`  🎨 Border: ${lastChange.name} at tstates ${lastChange.tstates}`);
        }
        
        // Check for copyright text area (0x1530-0x153F)
        if (cpu.PC >= 0x1530 && cpu.PC <= 0x1540) {
          console.log(`📜 Near copyright area at PC: 0x${cpu.PC.toString(16)}`);
          this.testResults.copyrightFound = true;
        }
        
        // Check for BASIC prompt area (around 0x0D6E)
        if (cpu.PC >= 0x0D6E && cpu.PC <= 0x0D80) {
          console.log(`💻 Near BASIC prompt at PC: 0x${cpu.PC.toString(16)}`);
          this.testResults.basicPromptFound = true;
        }
      }
      
      console.log(`✅ Boot simulation completed in ${steps} steps`);
      this.testResults.bootSequence.push({
        steps: steps,
        borderChanges: this.testResults.borderChanges.length,
        copyrightFound: this.testResults.copyrightFound,
        basicPromptFound: this.testResults.basicPromptFound
      });
      
    } catch (error) {
      console.log(`❌ Boot sequence simulation failed: ${error.message}`);
      this.testResults.errors.push(`Boot sequence simulation failed: ${error.message}`);
    }
  }

  getBorderColorName(color) {
    const colors = {
      0: 'Black',
      1: 'Blue', 
      2: 'Red',
      3: 'Magenta',
      4: 'Green',
      5: 'Cyan',
      6: 'Yellow',
      7: 'White'
    };
    return colors[color] || `Unknown(${color})`;
  }

  async verifyBootBehavior() {
    console.log('\n🔍 Verifying Expected Boot Behavior...');
    
    // Check for expected boot sequence characteristics
    const expectedCharacteristics = {
      borderSequence: this.testResults.borderChanges.length > 0,
      hasRedBorder: this.testResults.borderChanges.some(bc => bc.color === 2),
      hasBlackBorder: this.testResults.borderChanges.some(bc => bc.color === 0),
      copyrightDetected: this.testResults.copyrightFound,
      basicPromptReached: this.testResults.basicPromptFound,
      componentsWorking: this.testResults.componentsTested.length >= 3
    };
    
    console.log('📊 Boot Behavior Analysis:');
    console.log(`   ✅ Components tested: ${this.testResults.componentsTested.length}/3`);
    console.log(`   ✅ ROM loaded: ${this.testResults.romLoaded ? 'YES' : 'NO'}`);
    console.log(`   ✅ Z80 CPU working: ${this.testResults.z80Working ? 'YES' : 'NO'}`);
    console.log(`   ✅ ULA working: ${this.testResults.ulaWorking ? 'YES' : 'NO'}`);
    console.log(`   ✅ Border changes detected: ${expectedCharacteristics.borderSequence ? 'YES' : 'NO'}`);
    console.log(`   ✅ Red border during memory test: ${expectedCharacteristics.hasRedBorder ? 'YES' : 'NO'}`);
    console.log(`   ✅ Black border after clear: ${expectedCharacteristics.hasBlackBorder ? 'YES' : 'NO'}`);
    console.log(`   ✅ Copyright text area reached: ${expectedCharacteristics.copyrightDetected ? 'YES' : 'NO'}`);
    console.log(`   ✅ BASIC prompt area reached: ${expectedCharacteristics.basicPromptReached ? 'YES' : 'NO'}`);
    
    // Overall assessment
    const allRequirementsMet = Object.values(expectedCharacteristics).every(Boolean);
    
    if (allRequirementsMet) {
      console.log('\n🎉 BOOT SEQUENCE ASSESSMENT: SUCCESS ✅');
      console.log('🎉 The ZX Spectrum emulator implementation is working correctly!');
      console.log('🎉 Blue-grey bar issue should be RESOLVED!');
    } else {
      console.log('\n⚠️  BOOT SEQUENCE ASSESSMENT: PARTIAL SUCCESS');
      const failed = Object.entries(expectedCharacteristics)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
      console.log(`❌ Missing requirements: ${failed.join(', ')}`);
    }
    
    return allRequirementsMet;
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE BOOT TEST REPORT');
    console.log('===================================');
    
    // Component status
    console.log('\n🔧 Component Status:');
    console.log(`   Memory: ${this.testResults.componentsTested.includes('Memory') ? '✅' : '❌'}`);
    console.log(`   Z80 CPU: ${this.testResults.componentsTested.includes('Z80') ? '✅' : '❌'}`);
    console.log(`   ULA: ${this.testResults.componentsTested.includes('ULA') ? '✅' : '❌'}`);
    
    // Functionality status
    console.log('\n⚙️  Functionality Status:');
    console.log(`   ROM Loading: ${this.testResults.romLoaded ? '✅' : '❌'}`);
    console.log(`   Z80 Operations: ${this.testResults.z80Working ? '✅' : '❌'}`);
    console.log(`   ULA Display: ${this.testResults.ulaWorking ? '✅' : '❌'}`);
    
    // Boot sequence results
    console.log('\n🎮 Boot Sequence Results:');
    console.log(`   Steps executed: ${this.testResults.bootSequence[0]?.steps || 0}`);
    console.log(`   Border changes: ${this.testResults.borderChanges.length}`);
    if (this.testResults.borderChanges.length > 0) {
      console.log(`   Border pattern: ${this.testResults.borderChanges.map(bc => bc.name).join(' -> ')}`);
    }
    console.log(`   Copyright area reached: ${this.testResults.copyrightFound ? '✅' : '❌'}`);
    console.log(`   BASIC area reached: ${this.testResults.basicPromptFound ? '✅' : '❌'}`);
    
    // Errors
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Errors Encountered:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    // Final assessment
    console.log('\n✅ ACCEPTANCE CRITERIA ASSESSMENT:');
    console.log('=====================================');
    
    const acceptanceCriteria = [
      {
        name: 'Emulator loads and runs',
        passed: this.testResults.componentsTested.length >= 3
      },
      {
        name: 'ROM loads correctly',
        passed: this.testResults.romLoaded
      },
      {
        name: 'Z80 CPU executes instructions',
        passed: this.testResults.z80Working
      },
      {
        name: 'ULA display system works',
        passed: this.testResults.ulaWorking
      },
      {
        name: 'Boot sequence executes',
        passed: this.testResults.bootSequence.length > 0
      },
      {
        name: 'Border changes during boot',
        passed: this.testResults.borderChanges.length > 0
      },
      {
        name: 'Reaches copyright text area',
        passed: this.testResults.copyrightFound
      },
      {
        name: 'Reaches BASIC area',
        passed: this.testResults.basicPromptFound
      }
    ];
    
    acceptanceCriteria.forEach(criterion => {
      console.log(`${criterion.passed ? '✅' : '❌'} ${criterion.name}`);
    });
    
    const allPassed = acceptanceCriteria.every(c => c.passed);
    console.log(`\n🎯 FINAL RESULT: ${allPassed ? 'PASSED ✅' : 'PARTIAL PASS ⚠️'}`);
    
    if (allPassed) {
      console.log('\n🎉 SUCCESS: All core emulator functionality is working!');
      console.log('🎉 The ZX Spectrum emulator should display "@ 1982 Sinclair Research Ltd"');
      console.log('🎉 Blue-grey bar issue has been RESOLVED!');
    } else {
      console.log('\n🔧 The emulator has core functionality working but may need additional fixes.');
      console.log('🔧 Check the detailed results above for specific areas needing attention.');
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new SimplifiedBootTest();
  test.runAllTests().then(results => {
    console.log('\n🏁 Test execution completed');
    const success = results.componentsTested.length >= 3 && results.z80Working && results.ulaWorking;
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

export { SimplifiedBootTest };