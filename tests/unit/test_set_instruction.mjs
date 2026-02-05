// Detailed trace of SET 5,(IY+1) instruction
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

console.log('IY = 0x' + cpu.IY.toString(16));
console.log('FLAGS at 0x5C3B = 0x' + memory.read(0x5C3B).toString(16));

// Press L
console.log('\nPressing L key...');
keyMatrix[6] = 0xFD;

// Run frames and stop when we hit 0x030B
let stopped = false;
for (let frame = 0; frame < 20 && !stopped; frame++) {
  for (let i = 0; i < 70000 && !stopped; i++) {
    const pc = cpu.PC;
    if (pc === 0x030B) {
      console.log('\n=== At SET 5,(IY+1) instruction ===');
      console.log('PC = 0x' + pc.toString(16));
      console.log('IY = 0x' + cpu.IY.toString(16));
      console.log('IY+1 = 0x' + ((cpu.IY + 1) & 0xFFFF).toString(16));
      console.log('FLAGS at 0x5C3B before = 0x' + memory.read(0x5C3B).toString(16));
      
      // Read the instruction bytes
      const b0 = memory.read(0x030B);
      const b1 = memory.read(0x030C);
      const b2 = memory.read(0x030D);
      const b3 = memory.read(0x030E);
      console.log('Instruction bytes: 0x' + [b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' '));
      
      // Execute the instruction
      cpu.step();
      
      console.log('FLAGS at 0x5C3B after = 0x' + memory.read(0x5C3B).toString(16));
      console.log('PC after = 0x' + cpu.PC.toString(16));
      stopped = true;
    } else {
      cpu.step();
    }
  }
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('\nFinal FLAGS = 0x' + memory.read(0x5C3B).toString(16));
