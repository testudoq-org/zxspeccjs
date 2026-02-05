/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
// More comprehensive trace of keyboard and print flow
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';
const console = globalThis.console;

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
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.');
console.log('MODE (0x5C41) = 0x' + memory.read(0x5C41).toString(16));

// Press and release L key
console.log('\nPressing L key...');
keyMatrix[6] = 0xFD;

// Run 10 frames with key pressed
for (let frame = 0; frame < 10; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('After 10 frames with L pressed:');
console.log('  FLAGS = 0x' + memory.read(0x5C3B).toString(16));
console.log('  LASTK = 0x' + memory.read(0x5C08).toString(16));
console.log('  MODE = 0x' + memory.read(0x5C41).toString(16));

// Release L key
console.log('\nReleasing L key...');
keyMatrix[6] = 0xFF;

// Run 10 more frames
for (let frame = 0; frame < 10; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('After 10 frames with L released:');
console.log('  FLAGS = 0x' + memory.read(0x5C3B).toString(16));
console.log('  LASTK = 0x' + memory.read(0x5C08).toString(16));

// Check display file for any changes
console.log('\nDisplay file check (first few lines):');
const dispFile = 0x4000;
for (let line = 0; line < 3; line++) {
  let row = [];
  for (let col = 0; col < 32; col++) {
    const b = memory.read(dispFile + line * 256 + col);
    row.push(b.toString(16).padStart(2,'0'));
  }
  console.log(`  Line ${line}: ${row.join(' ')}`);
}

// Check if EDIT-LINE buffer has anything
console.log('\nE_LINE (editing line) buffer:');
const eLine = memory.read(0x5C59) + memory.read(0x5C5A) * 256;
console.log('  E_LINE pointer = 0x' + eLine.toString(16));
if (eLine >= 0x4000 && eLine < 0xFFFF) {
  let editBuf = [];
  for (let i = 0; i < 16; i++) {
    editBuf.push(memory.read(eLine + i).toString(16).padStart(2,'0'));
  }
  console.log('  Contents: ' + editBuf.join(' '));
}

// Check WORKSP for any tokens
console.log('\nWORKSP (workspace):');
const worksp = memory.read(0x5C61) + memory.read(0x5C62) * 256;
console.log('  WORKSP pointer = 0x' + worksp.toString(16));

console.log('\nFinal PC = 0x' + cpu.PC.toString(16));
