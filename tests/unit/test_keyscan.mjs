/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Minimal KEY-SCAN test - just run KEY-SCAN directly and check result
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function testKeyScan() {
  console.log('=== Minimal KEY-SCAN Test ===\n');

  const romData = fs.readFileSync('./roms/spec48.rom');
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate L key pressed on row 6
  let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFD, 0xFF];
  let portReads = [];

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
        portReads.push({ port: port & 0xFFFF, high, result, bc: (cpu.B << 8) | cpu.C });
        return result & 0xFF;
      }
      return 0xFF;
    },
    write: () => {}
  };

  // Set up CPU state for KEY-SCAN entry
  cpu.PC = 0x028E; // KEY-SCAN entry
  cpu.SP = 0xFF00;
  cpu.IY = 0x5C3A;
  cpu.IFF1 = false; // Don't handle interrupts
  cpu.IFF2 = false;

  // Push return address so RET goes somewhere safe
  cpu.SP -= 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12); // Return to 0x1200

  console.log('Before KEY-SCAN:');
  console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4,'0')}`);
  console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4,'0')}`);

  // Run until RET (PC goes to pushed return address)
  let steps = 0;
  while (steps < 500 && cpu.PC !== 0x1200) {
    cpu.step();
    steps++;
  }

  console.log(`\nAfter KEY-SCAN (${steps} steps):`);
  console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4,'0')}`);
  console.log(`  D: 0x${cpu.D.toString(16).padStart(2,'0')} (decimal ${cpu.D})`);
  console.log(`  E: 0x${cpu.E.toString(16).padStart(2,'0')} (decimal ${cpu.E})`);
  console.log(`  Flags Z: ${(cpu.F & 0x40) ? 1 : 0}, C: ${(cpu.F & 0x01) ? 1 : 0}`);

  console.log(`\nPort reads: ${portReads.length}`);
  portReads.forEach((r, i) => {
    const keyFound = (r.result & 0x1F) !== 0x1F;
    console.log(`  ${i}: port=0x${r.port.toString(16)}, BC=0x${r.bc.toString(16)}, result=0x${r.result.toString(16)} ${keyFound ? '(KEY!)' : ''}`);
  });

  // Interpret result
  console.log('\nInterpretation:');
  if (cpu.D === 0xFF && cpu.E === 0xFF) {
    console.log('  No key pressed');
  } else if (cpu.D < 8) {
    // D = number of keys minus 1, E = key code
    console.log(`  Keys found: D+1 = ${cpu.D + 1}`);
    console.log(`  Key code E: 0x${cpu.E.toString(16)} = ${cpu.E}`);
  } else {
    console.log(`  Unexpected result: D=0x${cpu.D.toString(16)}, E=0x${cpu.E.toString(16)}`);
  }

  console.log('\n=== End Test ===');
}

testKeyScan().catch(console.error);

