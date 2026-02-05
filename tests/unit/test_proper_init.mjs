/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test } from 'vitest';
const console = globalThis.console;

// Test with proper initial system variable values
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import * as fs from 'fs';

async function testProperInit() {
  console.log('=== Test with Proper Initialization ===\n');

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

  // Initialize like the real Spectrum boot
  // KSTATE: 8 bytes at 0x5C00, all 0xFF initially
  for (let i = 0x5C00; i < 0x5C08; i++) {
    memory.write(i, 0xFF);
  }
  // LAST_K at 0x5C08: 0xFF (no last key)
  memory.write(0x5C08, 0xFF);
  // REPDEL at 0x5C09: 35 (initial repeat delay)
  memory.write(0x5C09, 35);
  // REPPER at 0x5C0A: 5 (repeat period)
  memory.write(0x5C0A, 5);
  // FLAGS at 0x5C3B: bit 3=1 for K mode, typically 0x48 at boot
  memory.write(0x5C3B, 0x48);
  // FLAGS2 at 0x5C6A: typically 0x10
  memory.write(0x5C6A, 0x10);
  // MODE at 0x5C41: 0 for K mode
  memory.write(0x5C41, 0x00);

  cpu.IY = 0x5C3A;
  cpu.SP = 0xFF00;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  console.log('Initial state:');
  console.log(`  FLAGS (0x5C3B): 0x${memory.read(0x5C3B).toString(16)}`);
  console.log(`  LAST_K (0x5C08): 0x${memory.read(0x5C08).toString(16)}`);
  console.log('');

  // Run keyboard interrupt
  cpu.PC = 0x02BF;
  cpu.SP -= 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  
  let steps = 0;
  while (steps < 500 && cpu.PC !== 0x1200) {
    const pc = cpu.PC;
    
    // Watch K-DECODE entry
    if (pc === 0x0333) {
      console.log(`K-DECODE called: A=0x${cpu.A.toString(16)}, E=0x${cpu.E.toString(16)}, D=0x${cpu.D.toString(16)}, C=0x${cpu.C.toString(16)}`);
      console.log(`  D is FLAGS, should be 0x48`);
      console.log(`  C is previous LAST_K`);
    }
    
    // Watch K-DECODE return
    if (pc === 0x0366) {
      console.log(`K-DECODE returning with A=0x${cpu.A.toString(16)}`);
    }
    
    cpu.step();
    steps++;
  }

  console.log('\n=== Final State ===');
  console.log(`LAST_K (0x5C08): 0x${memory.read(0x5C08).toString(16)}`);
  console.log(`FLAGS bit 5: ${(memory.read(0x5C3B) & 0x20) ? 'SET' : 'CLEAR'}`);
  
  // Check if LAST_K is a valid character
  const lastK = memory.read(0x5C08);
  if (lastK >= 0x20 && lastK < 0x80) {
    console.log(`LAST_K as char: '${String.fromCharCode(lastK)}'`);
  } else {
    console.log(`LAST_K is a token or control code (0x${lastK.toString(16)})`);
  }
}

test('proper init smoke', async () => { await testProperInit(); });

