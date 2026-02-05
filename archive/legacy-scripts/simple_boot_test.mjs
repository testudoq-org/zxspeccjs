#!/usr/bin/env node

/**
 * Simple boot validation test - quick debug version
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

console.log('Starting simple boot validation test...');

try {
  // Create memory with ROM
  console.log('Creating memory...');
  const memory = new Memory({ model: '48k' });
  memory.loadROM(ROM_DATA.bytes, 0);
  console.log('Memory created and ROM loaded');
  
  // Create CPU and attach memory
  console.log('Creating CPU...');
  const cpu = new Z80(memory);
  cpu.reset();
  console.log(`CPU created. Initial PC: 0x${cpu.PC.toString(16)}, A: ${cpu.A}`);
  
  // Create ULA and attach CPU and memory
  console.log('Creating ULA...');
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
  const ula = new ULA(memory, mockCanvas);
  ula.attachCPU(cpu);
  console.log('ULA created');
  
  // Execute a small number of instructions first
  console.log('Executing 1000 T-states for testing...');
  const startTstates = cpu.tstates;
  const targetTstates = startTstates + 1000;
  let steps = 0;
  
  while (cpu.tstates < targetTstates && steps < 10000) {
    const consumed = cpu.step();
    
    // Generate ULA interrupts if enabled
    if (ula.interruptEnabled) {
      ula.generateInterrupt(consumed);
    }
    
    steps++;
    
    // Break if we're taking too many steps
    if (steps >= 10000) {
      console.log('Breaking after 10000 steps to prevent infinite loop');
      break;
    }
  }
  
  console.log(`After execution: PC=0x${cpu.PC.toString(16)}, A=${cpu.A}, T-states=${cpu.tstates}, Steps=${steps}`);
  
  // Check ROM is still accessible
  const romByte0 = memory.read(0x0000);
  console.log(`ROM byte 0: 0x${romByte0.toString(16)}`);
  
  // Check if we can write to RAM
  memory.write(0x4000, 0xAA);
  const ramByte = memory.read(0x4000);
  console.log(`RAM test: wrote 0xAA, read 0x${ramByte.toString(16)}`);
  
  console.log('Simple boot validation test completed successfully!');
  
} catch (error) {
  console.error('Error during test:', error);
  process.exit(1);
}