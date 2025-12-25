#!/usr/bin/env node

/**
 * Comprehensive boot sequence debug with actual ROM
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { readFileSync } from 'fs';

console.log('🔧 Comprehensive Boot Sequence Debug');
console.log('====================================');

try {
  // Load the actual Spectrum 48K ROM
  let romBuffer;
  try {
    romBuffer = readFileSync('./roms/spec48.rom');
    console.log('✅ Loaded actual Spectrum ROM (32KB)');
  } catch (e) {
    console.log('⚠️  Could not load ROM file, creating minimal boot ROM...');
    // Create a minimal ROM that includes the problematic instruction
    romBuffer = new Uint8Array(0x4000); // 16KB ROM
    
    // ED 2A 5D 5C at address 0x11CB
    romBuffer[0x11CB] = 0xED;
    romBuffer[0x11CC] = 0x2A;
    romBuffer[0x11CD] = 0x5D;
    romBuffer[0x11CE] = 0x5C;
    
    // Add a simple boot sequence
    romBuffer[0x0000] = 0xF3; // DI
    romBuffer[0x0001] = 0xCD; // CALL
    romBuffer[0x0002] = 0x00;
    romBuffer[0x0003] = 0x10;
    
    console.log('📝 Created minimal test ROM');
  }
  
  const memory = new Memory({ model: '48k' });
  
  // Load ROM
  if (romBuffer.length === 0x4000) {
    memory.loadROM(romBuffer, 0);
  } else {
    // Handle 32KB ROM by loading first 16KB
    memory.loadROM(romBuffer.subarray(0, 0x4000), 0);
  }
  
  const cpu = new Z80(memory);
  
  // Mock I/O for boot sequence
  const mockIO = {
    read(port) {
      // Port 0xFE - keyboard/ULA
      if ((port & 0xFF) === 0xFE) {
        return 0xFF; // No keys pressed
      }
      return 0xFF;
    },
    write(port, value, tstates) {
      // Port 0xFE - ULA control (border color, beeper, etc.)
      if ((port & 0xFF) === 0xFE) {
        // Log border changes
        const borderColor = value & 0x07;
        if (borderColor !== this.lastBorder) {
          console.log(`🎨 Border color changed to ${borderColor}`);
          this.lastBorder = borderColor;
        }
      }
    },
    lastBorder: 0
  };
  cpu.io = mockIO;
  
  console.log('✅ CPU initialized with ROM and I/O');
  
  // Test the specific problematic instruction from the audit report
  console.log('\n=== Testing Specific Boot Failure Point ===');
  
  // Set up the system state that would exist at boot time
  cpu.reset();
  cpu.PC = 0x0000;
  
  // Set up some initial system variables that the boot sequence expects
  // Address 0x5C5D is where the boot sequence tries to read from
  memory.writeWord(0x5C5D, 0x0000); // Initialize a system variable
  
  console.log(`🔍 Initial state: PC=0x${cpu.PC.toString(16)}, HL=0x${cpu._getHL().toString(16)}`);
  console.log(`📝 System variable at 0x5C5D: 0x${memory.readWord(0x5C5D).toString(16)}`);
  
  // Step through some boot instructions to reach the problematic area
  let steps = 0;
  const maxSteps = 100;
  let reachedProblemArea = false;
  
  console.log('\n🗺️  Tracing boot sequence...');
  
  while (steps < maxSteps && !reachedProblemArea) {
    const startPC = cpu.PC;
    
    // Stop if we reach the problematic area
    if (cpu.PC >= 0x11CB && cpu.PC <= 0x11CF) {
      reachedProblemArea = true;
      break;
    }
    
    const tstates = cpu.step();
    steps++;
    
    // Log significant boot milestones
    if (cpu.PC === 0x0028 || cpu.PC === 0x0038 || cpu.PC === 0x0050 || cpu.PC === 0x0066) {
      console.log(`🔍 Reached boot milestone at PC=0x${cpu.PC.toString(16)}`);
    }
  }
  
  console.log(`\n📍 Reached problematic area in ${steps} steps`);
  console.log(`📍 Current PC: 0x${cpu.PC.toString(16)}`);
  
  if (reachedProblemArea) {
    console.log('\n🎯 Now testing the specific failing instruction...');
    
    // Test the specific ED 2A 5D 5C instruction
    console.log(`🔍 Before executing LD HL,(0x5C5D):`);
    console.log(`   PC: 0x${cpu.PC.toString(16)}`);
    console.log(`   HL: 0x${cpu._getHL().toString(16)}`);
    console.log(`   Memory[0x5C5D]: 0x${memory.readWord(0x5C5D).toString(16)}`);
    
    // Check what's actually at the current PC
    const opcode1 = memory.read(cpu.PC);
    const opcode2 = memory.read(cpu.PC + 1);
    const opcode3 = memory.read(cpu.PC + 2);
    const opcode4 = memory.read(cpu.PC + 3);
    console.log(`   Memory[PC]: 0x${opcode1.toString(16)} 0x${opcode2.toString(16)} 0x${opcode3.toString(16)} 0x${opcode4.toString(16)}`);
    
    if (opcode1 === 0xED && opcode2 === 0x2A) {
      console.log('✅ Found the problematic LD HL,(nn) instruction!');
      
      const tstates = cpu.step();
      console.log(`🔍 After executing LD HL,(0x5C5D):`);
      console.log(`   PC: 0x${cpu.PC.toString(16)}`);
      console.log(`   HL: 0x${cpu._getHL().toString(16)}`);
      console.log(`   T-states: ${tstates}`);
      
      if (cpu._getHL() === memory.readWord(0x5C5D)) {
        console.log('✅ LD HL,(nn) instruction executed successfully!');
        console.log('🎉 The ED prefix implementation is working correctly!');
        console.log('💡 The boot failure might be caused by other factors...');
      } else {
        console.log('❌ LD HL,(nn) instruction failed!');
      }
    } else {
      console.log(`ℹ️  Current instruction is not LD HL,(nn): 0x${opcode1.toString(16)} 0x${opcode2.toString(16)}`);
      console.log('📍 Let me step forward to find the right location...');
      
      // Step forward to find the instruction
      for (let i = 0; i < 20; i++) {
        const tstates = cpu.step();
        const op1 = memory.read(cpu.PC);
        const op2 = memory.read(cpu.PC + 1);
        console.log(`   Step ${i + 1}: PC=0x${cpu.PC.toString(16)}, opcode=0x${op1.toString(16)} 0x${op2.toString(16)}`);
        
        if (op1 === 0xED && op2 === 0x2A) {
          console.log('🎯 Found LD HL,(nn) instruction!');
          break;
        }
      }
    }
  } else {
    console.log('❌ Did not reach the problematic area within step limit');
  }
  
  // Test a few more boot sequence operations
  console.log('\n=== Testing Additional Boot Sequence Operations ===');
  
  // Test other ED operations that might be used in boot
  console.log('Testing ED 22 (LD (nn),HL)...');
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x22); // LD (nn),HL
  memory.write(0x4002, 0x00);
  memory.write(0x4003, 0x10);
  
  const tstates1 = cpu.step();
  console.log(`LD (nn),HL: PC=0x${cpu.PC.toString(16)}, tstates=${tstates1}`);
  
  console.log('Testing ED 6B (LD SP,(nn))...');
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x6B); // LD SP,(nn)
  memory.write(0x4002, 0x00);
  memory.write(0x4003, 0x20);
  
  const tstates2 = cpu.step();
  console.log(`LD SP,(nn): PC=0x${cpu.PC.toString(16)}, tstates=${tstates2}`);
  
  console.log('\n✅ Comprehensive boot sequence debug completed');
  
} catch (error) {
  console.error('\n❌ Error during boot sequence debug:', error.message);
  console.error(error.stack);
}