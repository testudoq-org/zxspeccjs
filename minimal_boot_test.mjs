#!/usr/bin/env node

/**
 * Minimal boot validation test
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

console.log('Starting minimal boot validation test...');

try {
  // Create memory with ROM
  const memory = new Memory({ model: '48k' });
  memory.loadROM(ROM_DATA.bytes, 0);
  
  // Create CPU
  const cpu = new Z80(memory);
  cpu.reset();
  
  // Create mock canvas and ULA
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
  
  console.log('Initialization complete. Starting execution...');
  
  // Execute just a few instructions
  let steps = 0;
  let maxSteps = 1000;
  
  while (steps < maxSteps) {
    const consumed = cpu.step();
    
    // Generate ULA interrupts if enabled
    if (ula.interruptEnabled) {
      ula.generateInterrupt(consumed);
    }
    
    steps++;
    
    // Print progress every 100 steps
    if (steps % 100 === 0) {
      console.log(`Step ${steps}: PC=0x${cpu.PC.toString(16)}, A=${cpu.A}, T-states=${cpu.tstates}`);
    }
    
    // Break if we've gone too far
    if (cpu.tstates > 5000) {
      console.log('Reached target T-states, stopping');
      break;
    }
  }
  
  console.log(`Final state: PC=0x${cpu.PC.toString(16)}, A=${cpu.A}, T-states=${cpu.tstates}, Steps=${steps}`);
  
  // Test memory access
  const romByte = memory.read(0x0000);
  console.log(`ROM byte at 0x0000: 0x${romByte.toString(16)}`);
  
  memory.write(0x4000, 0xAA);
  const ramByte = memory.read(0x4000);
  console.log(`RAM test: wrote 0xAA, read 0x${ramByte.toString(16)}`);
  
  // Check some screen memory
  let screenContent = '';
  for (let i = 0; i < 100; i++) {
    const byte = memory.read(0x4000 + i);
    if (byte !== 0) {
      screenContent += `0x${byte.toString(16)} `;
    }
  }
  console.log(`First 100 bytes of screen memory (non-zero): ${screenContent || 'all zeros'}`);
  
  console.log('Minimal boot validation test completed successfully!');
  
} catch (error) {
  console.error('Error during test:', error);
  process.exit(1);
}