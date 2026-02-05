/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace what happens after key is consumed
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

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
      return (result & 0x1F) | 0xE0;
    }
    return 0xFF;
  },
  write: () => {}
};

cpu.reset();

// Boot
console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete. PC=0x' + cpu.PC.toString(16));

// Press L and trace after key consumption
console.log('\nPressing L key...');
keyMatrix[6] = 0xFD;

let traceAfterConsume = false;
let traceSteps = [];

cpu.debugCallback = (opcode, pc) => {
  // Start tracing after RES 5,(IY+1) at 0x10B8
  if (pc === 0x10BB) { // After the RES instruction completes
    traceAfterConsume = true;
    console.log('Key consumed, starting trace...');
    console.log('A=0x' + cpu.A.toString(16) + ' (key code)');
  }
  
  if (traceAfterConsume && traceSteps.length < 100) {
    traceSteps.push({ pc, opcode, a: cpu.A });
  }
  
  if (traceSteps.length === 100) {
    console.log('\n100 steps after key consumed:');
    traceSteps.forEach((s, i) => {
      if (i < 50 || i > 95) {
        console.log(`  ${i}: PC=0x${s.pc.toString(16).padStart(4,'0')} op=0x${s.opcode.toString(16).padStart(2,'0')} A=0x${s.a.toString(16).padStart(2,'0')}`);
      }
    });
    traceAfterConsume = false;
  }
};

for (let frame = 0; frame < 5; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('\nFinal PC=0x' + cpu.PC.toString(16));

