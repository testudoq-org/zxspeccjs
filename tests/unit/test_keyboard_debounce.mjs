/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Run multiple keyboard interrupts to test debounce
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function testKeyboardDebounce() {
  console.log('=== Keyboard Debounce Test ===\n');

  const romData = fs.readFileSync('./roms/spec48.rom');
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate L key pressed
  let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFD, 0xFF];

  cpu.io = {
    read: (port) => {
      if ((port & 0xFF) === 0xFE) {
        const high = (port >> 8) & 0xFF;
        let result = 0xFF;
        for (let row = 0; row < 8; row++) {
          if (((high >> row) & 0x01) === 0) {
            result &= keyMatrix[row];
          }
        }
        result |= 0b11100000;
        return result & 0xFF;
      }
      return 0xFF;
    },
    write: () => {}
  };

  // Initialize system variables
  for (let i = 0x5C00; i < 0x5C10; i++) {
    memory.write(i, 0xFF);
  }
  memory.write(0x5C3B, 0x40); // FLAGS

  cpu.IY = 0x5C3A;
  cpu.SP = 0xFF00;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  // Simulate multiple keyboard interrupts
  for (let interrupt = 0; interrupt < 10; interrupt++) {
    // Call KEYBOARD routine
    cpu.PC = 0x02BF;
    
    // Push return address
    cpu.SP -= 2;
    memory.write(cpu.SP, 0x00);
    memory.write(cpu.SP + 1, 0x12);
    
    // Execute until RET (back to 0x1200)
    let steps = 0;
    while (steps < 500 && cpu.PC !== 0x1200) {
      cpu.step();
      steps++;
    }
    
    const kstate = Array.from({length: 8}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2, '0')).join(' ');
    const lastK = memory.read(0x5C08);
    const flags = memory.read(0x5C3B);
    
    console.log(`Interrupt ${interrupt + 1}: KSTATE=[${kstate}] LAST_K=0x${lastK.toString(16)} FLAGS=0x${flags.toString(16)} (bit5=${(flags & 0x20) ? 1 : 0})`);
  }
  
  console.log('\n=== Final Analysis ===');
  const lastK = memory.read(0x5C08);
  const flags = memory.read(0x5C3B);
  console.log(`LAST_K: 0x${lastK.toString(16)} (expected 0x4C = 'L')`);
  console.log(`FLAGS bit 5: ${(flags & 0x20) ? 'SET - key ready!' : 'CLEAR - no key'}`);
}

testKeyboardDebounce().catch(console.error);

