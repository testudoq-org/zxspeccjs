#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🔍 Z80 Opcode Failure Analysis');
console.log('================================\n');

try {
  // Load ROM
  const romFileContent = readFileSync('./src/roms/spec48.js', 'utf8');
  const match = romFileContent.match(/bytes:\s*new\s+Uint8Array\(\[(.*?)\]\)/s);
  const byteValues = match[1].split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
  
  const { Z80 } = await import('./src/z80.mjs');
  const { Memory } = await import('./src/memory.mjs');
  
  const memory = new Memory({ romBuffer: byteValues, model: '48k' });
  const cpu = new Z80(memory);
  cpu.reset();
  
  console.log('🔧 Analyzing boot sequence instruction by instruction...\n');
  
  const problemAreas = [];
  const maxInstructions = 200;
  
  for (let i = 0; i < maxInstructions; i++) {
    const pcBefore = cpu.PC;
    const opcode = cpu.readByte(pcBefore);
    const opcodeStr = '0x' + opcode.toString(16).padStart(2, '0');
    
    // Log key instructions and those in problem areas
    const shouldLog = i < 20 || 
                     (pcBefore >= 0x0038 && pcBefore <= 0x0050) ||
                     (pcBefore >= 0x0055 && pcBefore <= 0x0060) ||
                     i % 50 === 0;
    
    if (shouldLog) {
      console.log(`📍 ${String(i + 1).padStart(3, ' ')}: PC=0x${pcBefore.toString(16).padStart(4, '0')} | Opcode=${opcodeStr} | SP=0x${cpu.SP.toString(16).padStart(4, '0')}`);
    }
    
    // Execute instruction with detailed error handling
    try {
      const tstates = cpu.step();
      const pcAfter = cpu.PC;
      
      // Check for suspicious patterns
      if (pcAfter === pcBefore && opcode !== 0x76) { // HALT should stop, others shouldn't
        console.log(`WARNING: NO PROGRESSION at PC=0x${pcBefore.toString(16).padStart(4, '0')} for opcode ${opcodeStr}`);
        problemAreas.push({
          instruction: i + 1,
          pc: pcBefore,
          opcode: opcode,
          reason: 'No PC progression'
        });
      }
      
      // Check for rapid back-and-forth (possible loop)
      if (i > 10 && Math.abs(pcAfter - pcBefore) > 1000) {
        console.log(`🔄 LARGE JUMP from 0x${pcBefore.toString(16).padStart(4, '0')} to 0x${pcAfter.toString(16).padStart(4, '0')}`);
      }
      
    } catch (e) {
      console.log(`EXECUTION FAILED at instruction ${i + 1}`);
      console.log(`   PC: 0x${pcBefore.toString(16).padStart(4, '0')}`);
      console.log(`   Opcode: ${opcodeStr}`);
      console.log(`   Error: ${e.message}`);
      
      problemAreas.push({
        instruction: i + 1,
        pc: pcBefore,
        opcode: opcode,
        reason: e.message
      });
      break;
    }
    
    // Stop if we reach known good areas
    if (pcBefore >= 0x1500) {
      console.log(`REACHED COPYRIGHT AREA! Stopping analysis.`);
      break;
    }
  }
  
  console.log(`\nANALYSIS RESULTS:`);
  console.log(`   Instructions analyzed: ${Math.min(maxInstructions, problemAreas.length > 0 ? problemAreas.length : maxInstructions)}`);
  console.log(`   Final PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`   Problem areas found: ${problemAreas.length}`);
  
  if (problemAreas.length > 0) {
    console.log(`\nPROBLEMATIC INSTRUCTIONS:`);
    problemAreas.forEach(problem => {
      console.log(`   #${problem.instruction}: PC=0x${problem.pc.toString(16).padStart(4, '0')}, Opcode=0x${problem.opcode.toString(16).padStart(2, '0')} - ${problem.reason}`);
    });
  }
  
  // Analyze the specific area where execution gets stuck
  console.log(`\nSTUCK AREA ANALYSIS:`);
  console.log(`   Execution appears stuck around PC=0x${cpu.PC.toString(16).padStart(4, '0')}`);
  
  // Show ROM content around the stuck area
  const stuckArea = cpu.PC;
  console.log(`   ROM content around 0x${stuckArea.toString(16).padStart(4, '0')}:`);
  for (let offset = -8; offset <= 8; offset++) {
    const addr = (stuckArea + offset) & 0xFFFF;
    const byte = cpu.readByte(addr);
    const marker = addr === stuckArea ? '>>> ' : '    ';
    console.log(`${marker}0x${addr.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} ${byte >= 32 && byte <= 126 ? '(' + String.fromCharCode(byte) + ')' : '   '}`);
  }
  
  // Common Z80 opcodes that might be missing
  console.log(`\nLIKELY MISSING OPCODES:`);
  const commonMissing = [0xED, 0xDD, 0xFD, 0xCB, 0x76]; // ED, DD, FD, CB prefixes, HALT
  
  problemAreas.forEach(problem => {
    if (commonMissing.includes(problem.opcode)) {
      console.log(`   WARNING: Possibly missing opcode implementation: 0x${problem.opcode.toString(16).padStart(2, '0')}`);
    }
  });
  
  // Check if it's a HALT instruction causing the hang
  const currentOpcode = cpu.readByte(cpu.PC);
  if (currentOpcode === 0x76) {
    console.log(`\nHALT DETECTED:`);
    console.log(`   The CPU is executing a HALT instruction at PC=0x${cpu.PC.toString(16).padStart(4, '0')}`);
    console.log(`   This is normal - the CPU will wait for an interrupt to continue`);
    console.log(`   INFO: The boot sequence may be waiting for an interrupt that never comes`);
    console.log(`   SOLUTION: Implement proper interrupt handling or trigger an interrupt`);
  }
  
  console.log(`\nRECOMMENDATIONS:`);
  if (problemAreas.length > 0) {
    console.log(`   1. Check Z80 implementation for missing opcode: 0x${problemAreas[0].opcode.toString(16).padStart(2, '0')}`);
    console.log(`   2. Verify interrupt handling - the CPU may be waiting for an interrupt`);
    console.log(`   3. Add interrupt request to continue boot sequence`);
  } else {
    console.log(`   1. Execution seems to be progressing normally`);
    console.log(`   2. May need more instructions to reach copyright display`);
    console.log(`   3. Consider implementing interrupt requests for continued execution`);
  }
  
  console.log('\n🏁 Opcode failure analysis completed');
  
} catch (e) {
  console.error('💥 Fatal error:', e.message);
  console.error('Stack trace:', e.stack);
  process.exit(1);
}