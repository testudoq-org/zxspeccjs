/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Test keyboard input after proper ROM boot
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

// Key matrix for L key: row 6, bit 1
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

// Boot the ROM for 100 frames
console.log('Booting ROM...');
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('After boot: IY=0x' + cpu.IY.toString(16));
console.log('FLAGS before key press: 0x' + memory.read(0x5C3B).toString(16));
console.log('LASTK before key press: 0x' + memory.read(0x5C08).toString(16));
console.log('');

// Press L key
console.log('Pressing L key (row 6, bit 1)...');
keyMatrix[6] = 0xFD;  // bit 1 = 0 (L key pressed)

// Run several more frames to let the keyboard routine detect the key
console.log('Running 20 more frames with L held...');
for (let frame = 0; frame < 20; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
  
  const flags = memory.read(0x5C3B);
  const lastk = memory.read(0x5C08);
  const kstate = Array.from({length: 8}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2, '0')).join(' ');
  console.log(`Frame ${frame+1}: FLAGS=0x${flags.toString(16)} (bit5=${(flags & 0x20) ? 1 : 0}) LASTK=0x${lastk.toString(16)} KSTATE=[${kstate}]`);
}

console.log('');
const finalFlags = memory.read(0x5C3B);
if (finalFlags & 0x20) {
  console.log('✓ FLAGS bit 5 is SET - keyboard input detected!');
} else {
  console.log('✗ FLAGS bit 5 is CLEAR - keyboard input NOT detected');
}

