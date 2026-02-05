/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace specific ROM addresses after key consumption
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
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
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete. PC=0x' + cpu.PC.toString(16));

// Press L
keyMatrix[6] = 0xFD;

let keyConsumed = false;
let pcLog = [];

for (let frame = 0; frame < 10; frame++) {
  for (let i = 0; i < 70000; i++) {
    const pc = cpu.PC;
    
    // Track when key is consumed
    if (pc === 0x10BC && !keyConsumed) {  // PUSH AF after RES 5,(IY+1)
      keyConsumed = true;
      console.log('Key consumed at frame ' + frame + ', A=0x' + cpu.A.toString(16) + ' (LASTK code)');
    }
    
    // Log PC values after key consumed
    if (keyConsumed && pcLog.length < 200) {
      pcLog.push(pc);
    }
    
    cpu.step();
  }
  if (cpu.IFF1) cpu.intRequested = true;
}

// Show PC log grouped by frequency
const pcCounts = {};
pcLog.forEach(pc => pcCounts[pc] = (pcCounts[pc] || 0) + 1);
const sorted = Object.entries(pcCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log('\nMost common PC values after key consumed:');
sorted.forEach(([pc, count]) => {
  console.log(`  0x${parseInt(pc).toString(16).padStart(4,'0')}: ${count}x`);
});

// Check if we ever hit print routines
const printRoutines = [0x0010, 0x15D4, 0x09F4, 0x0AD9, 0x0B65, 0x0D6B];
console.log('\nPrint routine hits:');
printRoutines.forEach(pr => {
  const hit = pcLog.includes(pr);
  console.log(`  0x${pr.toString(16)}: ${hit ? 'HIT' : 'no'}`);
});

// What's the final PC?
console.log('\nFinal PC=0x' + cpu.PC.toString(16));
