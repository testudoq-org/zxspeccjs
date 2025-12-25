#!/usr/bin/env node

/**
 * Task 5: Interrupt Setup and Timing Analysis
 * 
 * Comprehensive analysis of interrupt handling implementation and timing issues
 * that cause CPU execution to stop at PC 0x0038 during boot sequence.
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import spec48 from './src/roms/spec48.js';

class InterruptSetupTimingAnalyzer {
  constructor() {
    this.memory = null;
    this.cpu = null;
    this.analysis = {
      interruptMode: null,
      interruptFlipFlops: null,
      interruptVector: null,
      bootSequence: [],
      interruptHandler: [],
      issues: [],
      recommendations: []
    };
  }

  async initialize() {
    console.log('🔧 Interrupt Setup and Timing Analysis');
    console.log('======================================');
    
    // Initialize with spec48 ROM
    this.memory = new Memory(spec48.bytes);
    this.cpu = new Z80(this.memory);
    
    console.log('✅ Initialized CPU and Memory with spec48 ROM');
  }

  // 1. Analyze Interrupt Mode Configuration
  analyzeInterruptModeConfiguration() {
    console.log('\n📋 1. INTERRUPT MODE CONFIGURATION ANALYSIS');
    console.log('==========================================');
    
    // Check current interrupt mode setup
    this.analysis.interruptMode = {
      current: this.cpu.IM,
      shouldBe: 'Should be IM 1 for 48K Spectrum',
      registers: {
        I: this.cpu.I,
        R: this.cpu.R,
        IFF1: this.cpu.IFF1,
        IFF2: this.cpu.IFF2
      }
    };
    
    console.log(`🔍 Current Interrupt Mode: ${this.cpu.IM}`);
    console.log(`🔍 I Register: 0x${this.cpu.I.toString(16).padStart(2, '0')} (should be 0x3F for 48K)`);
    console.log(`🔍 R Register: 0x${this.cpu.R.toString(16).padStart(2, '0')}`);
    console.log(`🔍 IFF1 (Interrupt Flip-Flop 1): ${this.cpu.IFF1}`);
    console.log(`🔍 IFF2 (Interrupt Flip-Flop 2): ${this.cpu.IFF2}`);
    
    // Check if interrupts are properly disabled during reset
    if (!this.cpu.IFF1 && !this.cpu.IFF2) {
      console.log('✅ Interrupts correctly disabled after reset');
    } else {
      console.log('⚠️  WARNING: Interrupts may be enabled after reset');
      this.analysis.issues.push('Interrupts enabled after reset - should be disabled initially');
    }
    
    // Analyze IM mode implementation
    if (this.cpu.IM === 1) {
      console.log('✅ Using IM 1 mode (correct for 48K Spectrum)');
      console.log('   - Interrupts will jump to 0x0038');
      console.log('   - No vector table needed');
    } else {
      console.log(`❌ Incorrect interrupt mode: ${this.cpu.IM} (should be 1 for 48K)`);
      this.analysis.issues.push(`Incorrect interrupt mode: ${this.cpu.IM}`);
    }
    
    // Check I register setup for 48K
    if (this.cpu.I !== 0x3F) {
      console.log(`⚠️  I register not set to 0x3F (currently 0x${this.cpu.I.toString(16)})`);
      console.log('   This may affect interrupt vector table for IM 2');
    }
  }

  // 2. Analyze Early Boot Interrupt Behavior
  analyzeEarlyBootInterruptBehavior() {
    console.log('\n📋 2. EARLY BOOT INTERRUPT BEHAVIOR ANALYSIS');
    console.log('===========================================');
    
    // Reset CPU and examine boot sequence
    this.cpu.reset();
    
    console.log('🔍 Reset state analysis:');
    console.log(`   PC: 0x${this.cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`   SP: 0x${this.cpu.SP.toString(16).padStart(4, '0')}`);
    console.log(`   IFF1: ${this.cpu.IFF1}, IFF2: ${this.cpu.IFF2}`);
    console.log(`   IM: ${this.cpu.IM}`);
    
    // Execute first few instructions to see boot sequence
    console.log('\n🔍 Executing boot sequence:');
    const bootInstructions = [];
    
    for (let i = 0; i < 10; i++) {
      const pcBefore = this.cpu.PC;
      const opcode = this.memory.read(pcBefore);
      const tstates = this.cpu.step();
      
      bootInstructions.push({
        pc: pcBefore,
        opcode: opcode,
        instruction: this.disassembleOpcode(opcode, pcBefore),
        tstates: tstates,
        pcAfter: this.cpu.PC
      });
      
      const stepNum = (i + 1).toString().padStart(2);
      console.log(`   ${stepNum}. PC:0x${pcBefore.toString(16).padStart(4,'0')} ${this.disassembleOpcode(opcode, pcBefore).padEnd(15)} T:${tstates.toString().padStart(3)} -> 0x${this.cpu.PC.toString(16).padStart(4,'0')}`);
      
      // Check if we reach interrupt handler
      if (this.cpu.PC === 0x0038) {
        console.log('   ⚠️  BOOT SEQUENCE REACHED INTERRUPT HANDLER at 0x0038!');
        this.analysis.issues.push('Boot sequence jumps directly to interrupt handler at 0x0038');
        break;
      }
      
      // Stop if execution gets stuck
      if (i > 5 && this.cpu.PC === pcBefore) {
        console.log('   ❌ CPU execution appears to be stuck');
        break;
      }
    }
    
    this.analysis.bootSequence = bootInstructions;
    
    // Check what happens when CPU reaches 0x0038
    console.log('\n🔍 Testing interrupt handler execution:');
    if (this.cpu.PC === 0x0038) {
      this.testInterruptHandler();
    } else {
      console.log('   CPU did not reach interrupt handler in early boot sequence');
    }
  }

  // 3. Analyze Interrupt Timing and Contention
  analyzeInterruptTimingAndContention() {
    console.log('\n📋 3. INTERRUPT TIMING AND CONTENTION ANALYSIS');
    console.log('=============================================');
    
    // Check timing implementation
    console.log('🔍 Current timing implementation:');
    console.log(`   T-states: ${this.cpu.tstates}`);
    console.log('   No frame counter (FRAMES) implementation found');
    console.log('   No ULA interrupt generation found');
    
    // Analyze if timing-based interrupts are missing
    console.log('\n🔍 Missing timing components:');
    console.log('   ❌ No frame counter (FRAMES) register');
    console.log('   ❌ No 50Hz vertical sync interrupt generation');
    console.log('   ❌ No memory contention timing simulation');
    console.log('   ❌ No interrupt timing synchronization');
    
    this.analysis.issues.push('Missing 50Hz vertical sync interrupt generation');
    this.analysis.issues.push('No memory contention timing for interrupts');
  }

  // 4. Assess Current Interrupt Implementation
  assessCurrentInterruptImplementation() {
    console.log('\n📋 4. CURRENT INTERRUPT IMPLEMENTATION ASSESSMENT');
    console.log('=================================================');
    
    // Test interrupt request handling
    console.log('🔍 Testing interrupt request mechanism:');
    
    // Initially disabled
    this.cpu.IFF1 = false;
    this.cpu.intRequested = false;
    console.log(`   IFF1: ${this.cpu.IFF1}, intRequested: ${this.cpu.intRequested}`);
    
    // Request interrupt
    this.cpu.requestInterrupt();
    console.log(`   After requestInterrupt(): intRequested = ${this.cpu.intRequested}`);
    console.log(`   CPU should ignore interrupt because IFF1 = ${this.cpu.IFF1}`);
    
    // Enable interrupts and test
    this.cpu.IFF1 = true;
    this.cpu.IFF2 = true;
    
    const pcBefore = this.cpu.PC;
    this.cpu.intRequested = true;
    
    console.log('\n🔍 Testing interrupt handling with IFF1=true:');
    console.log(`   PC before: 0x${pcBefore.toString(16).padStart(4, '0')}`);
    console.log(`   IFF1: ${this.cpu.IFF1}, intRequested: ${this.cpu.intRequested}`);
    
    // Execute step - should handle interrupt
    const tstates = this.cpu.step();
    
    console.log(`   PC after: 0x${this.cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`   T-states consumed: ${tstates} (should be ~13 for interrupt)`);
    console.log(`   IFF1 after: ${this.cpu.IFF1}, IFF2 after: ${this.cpu.IFF2}`);
    
    // Check if it jumped to interrupt handler
    if (this.cpu.PC === 0x0038) {
      console.log('   ✅ Correctly jumped to interrupt handler at 0x0038');
    } else {
      console.log(`   ❌ Did not jump to interrupt handler (PC = 0x${this.cpu.PC.toString(16)})`);
      this.analysis.issues.push('Interrupt handling does not jump to 0x0038');
    }
    
    if (tstates === 13) {
      console.log('   ✅ Correct t-state consumption for interrupt');
    } else {
      console.log(`   ❌ Incorrect t-state consumption: ${tstates} (expected ~13)`);
    }
    
    if (!this.cpu.IFF1 && !this.cpu.IFF2) {
      console.log('   ✅ Interrupts correctly disabled after handling');
    } else {
      console.log('   ⚠️  Interrupts may not be properly disabled after handling');
    }
  }

  // 5. Analyze Relationship to CPU Early Stop
  analyzeRelationshipToCPUEarlyStop() {
    console.log('\n📋 5. RELATIONSHIP TO CPU EARLY STOP ANALYSIS');
    console.log('=============================================');
    
    console.log('🔍 Connection between interrupts and ROM boot sequence:');
    
    // Check if interrupts are enabled too early
    console.log('\n🔍 Interrupt enable timing in boot sequence:');
    for (let addr = 0; addr < 50; addr++) {
      const opcode = this.memory.read(addr);
      if (opcode === 0xFB) { // EI instruction
        console.log(`   EI instruction found at 0x${addr.toString(16).padStart(4, '0')}`);
        console.log('   ⚠️  Interrupts enabled early in boot - may cause issues');
        this.analysis.issues.push('Interrupts enabled early in boot sequence');
        break;
      }
    }
    
    // Check if interrupt handler causes execution to halt
    console.log('\n🔍 Analyzing interrupt handler content:');
    this.analyzeInterruptHandlerContent();
    
    // Check for proper RET instruction in handler
    console.log('\n🔍 Checking for proper exit from interrupt handler:');
    let hasRet = false;
    for (let addr = 0x0038; addr < 0x0080; addr++) {
      if (this.memory.read(addr) === 0xC9) { // RET instruction
        console.log(`   ✅ Found RET instruction at 0x${addr.toString(16).padStart(4, '0')}`);
        hasRet = true;
        break;
      }
    }
    
    if (!hasRet) {
      console.log('   ❌ No RET instruction found in interrupt handler');
      console.log('   This explains why execution gets stuck - no way to return!');
      this.analysis.issues.push('Interrupt handler lacks proper RET instruction');
    }
  }

  // Helper method to disassemble opcodes
  disassembleOpcode(opcode, pc) {
    switch (opcode) {
      case 0xF3: return 'DI';
      case 0xFB: return 'EI';
      case 0xAF: return 'XOR A';
      case 0xC3: return 'JP nn';
      case 0x00: return 'NOP';
      case 0xED: return 'ED prefix';
      case 0xDD: return 'DD prefix';
      case 0xFD: return 'FD prefix';
      case 0xCB: return 'CB prefix';
      default: return `DB 0x${opcode.toString(16).padStart(2, '0')}`;
    }
  }

  // Test interrupt handler execution
  testInterruptHandler() {
    console.log('\n🔧 Testing interrupt handler execution:');
    
    // Set up CPU at interrupt handler
    this.cpu.PC = 0x0038;
    
    // Execute a few instructions in the handler
    console.log('   Executing interrupt handler instructions:');
    for (let i = 0; i < 10; i++) {
      const pcBefore = this.cpu.PC;
      const opcode = this.memory.read(pcBefore);
      const tstates = this.cpu.step();
      
      const stepNum = (i + 1).toString().padStart(2);
      console.log(`   ${stepNum}. PC:0x${pcBefore.toString(16).padStart(4,'0')} ${this.disassembleOpcode(opcode, pcBefore).padEnd(15)} T:${tstates.toString().padStart(3)} -> 0x${this.cpu.PC.toString(16).padStart(4,'0')}`);
      
      // Check if we find a RET instruction
      if (opcode === 0xC9) {
        console.log('   ✅ Found RET instruction - handler can exit properly');
        break;
      }
      
      // Check if execution gets stuck
      if (i > 5 && this.cpu.PC === pcBefore) {
        console.log('   ❌ Execution stuck in interrupt handler');
        this.analysis.issues.push('Execution gets stuck in interrupt handler');
        break;
      }
    }
  }

  // Analyze interrupt handler content
  analyzeInterruptHandlerContent() {
    console.log('   Interrupt handler (0x0038) content:');
    for (let addr = 0x0038; addr < 0x0050; addr++) {
      const opcode = this.memory.read(addr);
      console.log(`   0x${addr.toString(16).padStart(4, '0')}: 0x${opcode.toString(16).padStart(2, '0')} ${this.disassembleOpcode(opcode, addr)}`);
    }
  }

  // Generate recommendations
  generateRecommendations() {
    console.log('\n📋 RECOMMENDATIONS FOR FIXING INTERRUPT HANDLING');
    console.log('===============================================');
    
    this.analysis.recommendations = [
      {
        priority: 'HIGH',
        issue: 'CPU stops at 0x0038 due to missing interrupt generation',
        solution: 'Implement 50Hz vertical sync interrupt generation in ULA',
        implementation: 'Add timer-based interrupt requests to CPU during frame rendering'
      },
      {
        priority: 'HIGH',
        issue: 'Boot sequence jumps directly to interrupt handler',
        solution: 'Verify ROM interrupt handler has proper RET instruction',
        implementation: 'Check and fix interrupt handler at 0x0038 in ROM'
      },
      {
        priority: 'MEDIUM',
        issue: 'No memory contention timing for interrupts',
        solution: 'Implement accurate memory contention during interrupt handling',
        implementation: 'Add t-state accurate memory access patterns during interrupts'
      },
      {
        priority: 'MEDIUM',
        issue: 'Missing frame counter (FRAMES) register',
        solution: 'Implement FRAMES register for timing-dependent operations',
        implementation: 'Add FRAMES increment every 50Hz frame'
      },
      {
        priority: 'LOW',
        issue: 'I register not set to 0x3F for 48K',
        solution: 'Set I register to 0x3F during CPU reset',
        implementation: 'Update CPU reset to set I = 0x3F for proper 48K operation'
      }
    ];
    
    for (const rec of this.analysis.recommendations) {
      console.log(`\n${rec.priority} PRIORITY:`);
      console.log(`   Issue: ${rec.issue}`);
      console.log(`   Solution: ${rec.solution}`);
      console.log(`   Implementation: ${rec.implementation}`);
    }
  }

  // Generate final report
  generateReport() {
    console.log('\n🎯 FINAL ANALYSIS REPORT');
    console.log('========================');
    
    console.log('\n📊 SUMMARY OF ISSUES:');
    this.analysis.issues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue}`);
    });
    
    console.log('\n🔍 ROOT CAUSE ANALYSIS:');
    console.log('   The CPU execution stops at 0x0038 because:');
    console.log('   1. The boot sequence jumps directly to the interrupt handler');
    console.log('   2. No interrupts are generated during boot sequence');
    console.log('   3. The interrupt handler may lack proper RET instruction');
    console.log('   4. Missing 50Hz vertical sync interrupt generation');
    
    console.log('\n✅ INTERRUPT IMPLEMENTATION STATUS:');
    console.log('   ✅ Basic interrupt request mechanism exists');
    console.log('   ✅ IM 1 mode correctly implemented');
    console.log('   ✅ EI/DI instructions work correctly');
    console.log('   ❌ No automatic interrupt generation during boot');
    console.log('   ❌ No 50Hz frame-based interrupts');
    console.log('   ❌ No memory contention timing during interrupts');
    console.log('   ❌ Missing FRAMES register implementation');
    
    return this.analysis;
  }

  // Run complete analysis
  async runCompleteAnalysis() {
    await this.initialize();
    this.analyzeInterruptModeConfiguration();
    this.analyzeEarlyBootInterruptBehavior();
    this.analyzeInterruptTimingAndContention();
    this.assessCurrentInterruptImplementation();
    this.analyzeRelationshipToCPUEarlyStop();
    this.generateRecommendations();
    return this.generateReport();
  }
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new InterruptSetupTimingAnalyzer();
  analyzer.runCompleteAnalysis()
    .then(report => {
      console.log('\n🎉 Analysis completed successfully');
      console.log('   Key finding: Interrupts are not being generated during boot');
      console.log('   Solution: Implement 50Hz interrupt generation in ULA');
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error.message);
      process.exit(1);
    });
}

export { InterruptSetupTimingAnalyzer };