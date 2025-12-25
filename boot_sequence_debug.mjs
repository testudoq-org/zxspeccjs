#!/usr/bin/env node
import { readFileSync } from 'fs';
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { ULA } from './src/ula.mjs';

console.log('🔍 ZX Spectrum ROM Boot Sequence Debug Tool');
console.log('===========================================\n');

// Load ROM
function loadROM() {
  try {
    const spec48 = JSON.parse(readFileSync('./src/roms/spec48.js', 'utf8'));
    return new Uint8Array(spec48.bytes);
  } catch (e) {
    console.error('❌ Failed to load ROM:', e.message);
    return null;
  }
}

// Boot sequence analyzer
class BootSequenceAnalyzer {
  constructor() {
    this.romBytes = loadROM();
    if (!this.romBytes) {
      throw new Error('Failed to load ROM');
    }
    
    // Initialize memory with ROM
    this.memory = new Memory({ romBuffer: this.romBytes, model: '48k' });
    this.cpu = new Z80(this.memory);
    this.cpu.reset();
    
    // Create mock ULA for rendering
    this.canvas = { 
      width: 256, 
      height: 192,
      style: {}
    };
    this.ula = new ULA(this.memory, this.canvas);
    
    // Debug tracking
    this.instructionLog = [];
    this.pcHistory = [];
    this.visitedAddresses = new Set();
    this.loopDetection = new Map();
    this.maxInstructions = 10000; // Prevent infinite loops
    this.instructionCount = 0;
    
    // Key boot sequence addresses
    this.bootMilestones = {
      resetVector: 0x0000,
      interruptVector: 0x0038,
      copyrightDisplay: 0x1530,
      basicPrompt: 0x0D6E,
      errorHandler: 0x0055,
      channelStreams: 0x163C
    };
    
    console.log('✅ Initialized boot sequence analyzer');
    console.log(`📍 Boot milestones:`);
    Object.entries(this.bootMilestones).forEach(([name, addr]) => {
      console.log(`   ${name}: 0x${addr.toString(16).padStart(4, '0')}`);
    });
    console.log('');
  }

  // Monitor instruction execution
  stepWithLogging() {
    const pcBefore = this.cpu.PC;
    const spBefore = this.cpu.SP;
    const opcode = this.cpu.readByte(pcBefore);
    
    // Check for loops
    if (!this.visitedAddresses.has(pcBefore)) {
      this.visitedAddresses.add(pcBefore);
      this.loopDetection.set(pcBefore, 1);
    } else {
      const count = this.loopDetection.get(pcBefore) + 1;
      this.loopDetection.set(pcBefore, count);
      
      if (count > 100) {
        console.log(`🚨 DETECTED INFINITE LOOP at PC: 0x${pcBefore.toString(16).padStart(4, '0')} (opcode: 0x${opcode.toString(16).padStart(2, '0')})`);
        console.log(`   Loop count: ${count}`);
        return false;
      }
    }
    
    // Log key instructions
    if (this.instructionCount < 100 || 
        (pcBefore >= this.bootMilestones.copyrightDisplay - 10 && pcBefore <= this.bootMilestones.copyrightDisplay + 10) ||
        (pcBefore >= this.bootMilestones.basicPrompt - 10 && pcBefore <= this.bootMilestones.basicPrompt + 10) ||
        pcBefore === this.bootMilestones.interruptVector ||
        this.instructionCount % 1000 === 0) {
      
      const instruction = this.disassemble(opcode, pcBefore);
      this.instructionLog.push({
        pc: pcBefore,
        opcode,
        instruction,
        sp: spBefore,
        af: this.cpu._getAF(),
        bc: this.cpu._getBC(),
        de: this.cpu._getDE(),
        hl: this.cpu._getHL(),
        flags: this.cpu.F.toString(16).padStart(2, '0')
      });
      
      // Limit log size
      if (this.instructionLog.length > 1000) {
        this.instructionLog.shift();
      }
    }
    
    // Execute instruction
    try {
      const tstates = this.cpu.step();
      this.instructionCount++;
      
      // Check if we hit key milestones
      this.checkBootMilestones();
      
      return true;
    } catch (e) {
      console.log(`❌ EXECUTION ERROR at PC: 0x${pcBefore.toString(16).padStart(4, '0')}`);
      console.log(`   Opcode: 0x${opcode.toString(16).padStart(2, '0')}`);
      console.log(`   Error: ${e.message}`);
      console.log(`   Stack trace: ${e.stack}`);
      return false;
    }
  }

  // Simple disassembler for common boot sequence instructions
  disassemble(opcode, pc) {
    const opStr = opcode.toString(16).padStart(2, '0');
    
    switch (opcode) {
      case 0x00: return 'NOP';
      case 0xF3: return 'DI';
      case 0xFB: return 'EI';
      case 0xC3: {
        const addr = this.cpu.readWord(pc + 1);
        return `JP 0x${addr.toString(16).padStart(4, '0')}`;
      }
      case 0xC9: return 'RET';
      case 0xCD: {
        const addr = this.cpu.readWord(pc + 1);
        return `CALL 0x${addr.toString(16).padStart(4, '0')}`;
      }
      case 0xE3: return 'EX (SP),HL';
      case 0xD9: return 'EXX';
      case 0x08: return 'EX AF,AF\'';
      case 0x2A: {
        const addr = this.cpu.readWord(pc + 1);
        return `LD HL,(0x${addr.toString(16).padStart(4, '0')})`;
      }
      case 0x22: {
        const addr = this.cpu.readWord(pc + 1);
        return `LD (0x${addr.toString(16).padStart(4, '0')}),HL`;
      }
      case 0x3E: {
        const val = this.cpu.readByte(pc + 1);
        return `LD A,0x${val.toString(16).padStart(2, '0')}`;
      }
      case 0x01: {
        const val = this.cpu.readWord(pc + 1);
        return `LD BC,0x${val.toString(16).padStart(4, '0')}`;
      }
      case 0x11: {
        const val = this.cpu.readWord(pc + 1);
        return `LD DE,0x${val.toString(16).padStart(4, '0')}`;
      }
      case 0x21: {
        const val = this.cpu.readWord(pc + 1);
        return `LD HL,0x${val.toString(16).padStart(4, '0')}`;
      }
      case 0x31: {
        const val = this.cpu.readWord(pc + 1);
        return `LD SP,0x${val.toString(16).padStart(4, '0')}`;
      }
      case 0xF9: return 'LD SP,HL';
      case 0xDB: {
        const port = this.cpu.readByte(pc + 1);
        return `IN A,(0x${port.toString(16).padStart(2, '0')})`;
      }
      case 0xD3: {
        const port = this.cpu.readByte(pc + 1);
        return `OUT (0x${port.toString(16).padStart(2, '0')}),A`;
      }
      default:
        return `DB 0x${opStr}`;
    }
  }

  // Check if we've reached key boot milestones
  checkBootMilestones() {
    const pc = this.cpu.PC;
    
    if (pc === this.bootMilestones.copyrightDisplay) {
      console.log('🎯 REACHED COPYRIGHT DISPLAY AREA!');
    }
    
    if (pc === this.bootMilestones.basicPrompt) {
      console.log('🎯 REACHED BASIC PROMPT AREA!');
    }
    
    if (pc === this.bootMilestones.interruptVector) {
      console.log('⚠️  EXECUTING INTERRUPT VECTOR at 0x0038');
    }
  }

  // Run boot sequence with detailed monitoring
  async runBootSequence(maxInstructions = 5000, instructionDelay = 0) {
    console.log(`🚀 Starting boot sequence analysis (max ${maxInstructions} instructions)...\n`);
    
    const startTime = Date.now();
    let running = true;
    
    while (running && this.instructionCount < maxInstructions) {
      running = this.stepWithLogging();
      
      // Progress reporting
      if (this.instructionCount % 1000 === 0) {
        const elapsed = Date.now() - startTime;
        const pc = this.cpu.PC;
        console.log(`📊 Instruction ${this.instructionCount}: PC=0x${pc.toString(16).padStart(4, '0')}, Time=${elapsed}ms`);
        
        // Show recent instruction context
        if (this.instructionLog.length >= 5) {
          console.log('   Recent instructions:');
          this.instructionLog.slice(-5).forEach(inst => {
            console.log(`     0x${inst.pc.toString(16).padStart(4, '0')}: ${inst.instruction}`);
          });
        }
      }
      
      // Check if we're stuck (no PC progression for too long)
      if (this.instructionCount > 100) {
        const recentPCs = this.instructionLog.slice(-50).map(log => log.pc);
        const uniquePCs = new Set(recentPCs);
        if (uniquePCs.size < 10) {
          console.log(`⚠️  POSSIBLE STALL: Only ${uniquePCs.size} unique PCs in last 50 instructions`);
        }
      }
      
      // Small delay to prevent overwhelming output
      if (instructionDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, instructionDelay));
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`\n🏁 Boot sequence analysis completed`);
    console.log(`   Instructions executed: ${this.instructionCount}`);
    console.log(`   Final PC: 0x${this.cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`   Total time: ${elapsed}ms`);
    
    return this.generateReport();
  }

  // Generate detailed analysis report
  generateReport() {
    console.log('\n📋 DETAILED ANALYSIS REPORT');
    console.log('============================');
    
    // Execution summary
    console.log(`\n📈 EXECUTION SUMMARY:`);
    console.log(`   Total instructions: ${this.instructionCount}`);
    console.log(`   Unique addresses visited: ${this.visitedAddresses.size}`);
    console.log(`   Final PC: 0x${this.cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`   Final SP: 0x${this.cpu.SP.toString(16).padStart(4, '0')}`);
    console.log(`   Interrupt flags: IFF1=${this.cpu.IFF1}, IFF2=${this.cpu.IFF2}, IM=${this.cpu.IM}`);
    
    // Loop analysis
    console.log(`\n🔄 LOOP ANALYSIS:`);
    const loops = Array.from(this.loopDetection.entries())
      .filter(([addr, count]) => count > 10)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    if (loops.length === 0) {
      console.log('   No significant loops detected');
    } else {
      console.log('   Top loop locations:');
      loops.forEach(([addr, count]) => {
        const opcode = this.cpu.readByte(addr);
        const instruction = this.disassemble(opcode, addr);
        console.log(`     0x${addr.toString(16).padStart(4, '0')}: ${instruction} (${count} times)`);
      });
    }
    
    // Memory analysis around key areas
    console.log(`\n💾 MEMORY ANALYSIS:`);
    Object.entries(this.bootMilestones).forEach(([name, addr]) => {
      const bytes = [];
      for (let i = 0; i < 8; i++) {
        bytes.push(this.cpu.readByte(addr + i).toString(16).padStart(2, '0'));
      }
      console.log(`   ${name.padEnd(20)}: ${bytes.join(' ')}`);
    });
    
    // Key instruction analysis
    console.log(`\n🔍 KEY INSTRUCTIONS EXECUTED:`);
    const keyInstructions = this.instructionLog.filter(log => 
      log.instruction.includes('CALL') || 
      log.instruction.includes('JP') || 
      log.instruction.includes('RET') ||
      log.instruction.includes('IN') ||
      log.instruction.includes('OUT')
    ).slice(-20);
    
    if (keyInstructions.length > 0) {
      keyInstructions.forEach(inst => {
        console.log(`   0x${inst.pc.toString(16).padStart(4, '0')}: ${inst.instruction}`);
      });
    }
    
    // Diagnosis
    console.log(`\n🎯 BOOT SEQUENCE DIAGNOSIS:`);
    const finalPC = this.cpu.PC;
    
    if (finalPC >= 0x1500 && finalPC <= 0x1600) {
      console.log('   ✅ EXECUTION REACHED COPYRIGHT DISPLAY AREA');
      console.log('   📺 Display should be showing copyright message');
    } else if (finalPC >= 0x0D00 && finalPC <= 0x0E00) {
      console.log('   ✅ EXECUTION REACHED BASIC PROMPT AREA');
      console.log('   💻 Display should show BASIC prompt');
    } else if (finalPC === 0x0038) {
      console.log('   ⚠️  STUCK IN INTERRUPT HANDLER at 0x0038');
      console.log('   🔄 This suggests interrupts are firing but not returning properly');
    } else if (finalPC < 0x100) {
      console.log('   ⚠️  EXECUTION STUCK IN EARLY BOOT (PC < 0x100)');
      console.log('   🐛 Possible issues: missing opcodes, invalid ROM data, or memory corruption');
    } else {
      console.log('   ❓ EXECUTION PROGRESSED BEYOND EARLY BOOT');
      console.log(`   📍 Current location: 0x${finalPC.toString(16).padStart(4, '0')}`);
      console.log('   🎯 Next expected: copyright display at 0x1530-0x1540');
    }
    
    // Check for common issues
    console.log(`\n🐛 POTENTIAL ISSUES DETECTED:`);
    
    if (this.instructionCount >= this.maxInstructions) {
      console.log('   • Execution hit instruction limit - possible infinite loop');
    }
    
    if (this.loopDetection.size > 0) {
      console.log('   • Multiple instruction repeats detected - possible loop');
    }
    
    // Check if copyright message area has been written to
    const copyrightAddr = 0x1530;
    let copyrightData = '';
    for (let i = 0; i < 32; i++) {
      const byte = this.cpu.readByte(copyrightAddr + i);
      if (byte >= 32 && byte <= 126) {
        copyrightData += String.fromCharCode(byte);
      } else {
        break;
      }
    }
    
    if (copyrightData.includes('1982') || copyrightData.includes('Sinclair')) {
      console.log('   ✅ Copyright message area contains expected text');
    } else {
      console.log('   ❌ Copyright message area does not contain expected text');
      console.log(`   📝 Content: "${copyrightData}"`);
    }
    
    return {
      instructionCount: this.instructionCount,
      finalPC: this.cpu.PC,
      loops: this.loopDetection,
      copyrightData: copyrightData,
      visitedCount: this.visitedAddresses.size
    };
  }
}

// Main execution
async function main() {
  try {
    const analyzer = new BootSequenceAnalyzer();
    const result = await analyzer.runBootSequence(8000, 0); // Run 8000 instructions with no delay
    
    console.log('\n🏁 BOOT SEQUENCE DEBUG COMPLETE');
    console.log('================================');
    
    return result;
  } catch (e) {
    console.error('💥 Fatal error during boot sequence analysis:', e);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { BootSequenceAnalyzer };