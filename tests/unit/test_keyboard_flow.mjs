/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace keyboard processing flow
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

// Key ROM routines
const routines = {
  0x02BF: 'KEYBOARD (interrupt handler)',
  0x028E: 'KEY-SCAN',
  0x0308: 'K-DONE (store to LASTK)',
  0x030B: 'SET FLAGS bit 5',
  0x10A8: 'WAIT-KEY/KEY-INPUT',
  0x10B0: 'BIT 5,(IY+1) - test key avail',
  0x10B8: 'RES 5,(IY+1) - consume key',
  0x15D4: 'PRINT-A-1',
  0x0010: 'RST 10 (PRINT-A)',
  0x09F4: 'PRINT-A',
  0x0AD9: 'PO-CHAR',
  0x0B65: 'PO-ABLE',
  0x0D6B: 'PRINT-OUT'
};

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

// Press L and trace
console.log('\nPressing L key and tracing...');
keyMatrix[6] = 0xFD;

let hitRoutines = new Map();
cpu.debugCallback = (opcode, pc) => {
  if (routines[pc] && !hitRoutines.has(pc)) {
    hitRoutines.set(pc, 1);
    console.log(`Hit 0x${pc.toString(16)}: ${routines[pc]}`);
  } else if (routines[pc]) {
    hitRoutines.set(pc, hitRoutines.get(pc) + 1);
  }
};

for (let frame = 0; frame < 10; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('\nRoutine hit counts:');
for (const [pc, count] of hitRoutines) {
  console.log(`  0x${pc.toString(16)}: ${routines[pc]} (${count}x)`);
}

// Check screen memory for the L/LIST keyword
console.log('\nScreen check at display file:');
const dispStart = 0x4000;
for (let row = 0; row < 2; row++) {
  let line = [];
  for (let col = 0; col < 32; col++) {
    line.push(memory.read(dispStart + row * 32 + col).toString(16).padStart(2, '0'));
  }
  console.log(`  Row ${row}: ${line.join(' ')}`);
}

