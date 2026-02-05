/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace if SET 5,(IY+1) at 0x030B is ever executed
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
let hit030B = false;
let hitCount = 0;

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

cpu.debugCallback = (opcode, pc) => {
  if (pc === 0x030B) {
    hitCount++;
    if (!hit030B) {
      hit030B = true;
      console.log(`First hit at 0x030B at step, IY=0x${cpu.IY.toString(16)}, FLAGS before=0x${memory.read(0x5C3B).toString(16)}`);
    }
  }
};

cpu.reset();

// Boot
console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}
console.log('Boot complete. hitCount at 0x030B: ' + hitCount);

// Press L
console.log('Pressing L key...');
keyMatrix[6] = 0xFD;
hitCount = 0;

for (let frame = 0; frame < 20; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('After 20 frames with L pressed: hitCount at 0x030B = ' + hitCount);
console.log('FLAGS = 0x' + memory.read(0x5C3B).toString(16));
console.log('LASTK = 0x' + memory.read(0x5C08).toString(16));