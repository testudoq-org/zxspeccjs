/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Check I/O channel setup
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
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete. Checking I/O channel system...\n');

// Check channel info
const chans = memory.read(0x5C4F) + memory.read(0x5C50) * 256;
console.log('CHANS (channel info area) = 0x' + chans.toString(16));

const curchl = memory.read(0x5C51) + memory.read(0x5C52) * 256;
console.log('CURCHL (current channel) = 0x' + curchl.toString(16));

// Read channel data
console.log('\nChannel data at CHANS:');
for (let i = 0; i < 16; i++) {
  const b = memory.read(chans + i);
  console.log(`  0x${(chans + i).toString(16)}: 0x${b.toString(16).padStart(2,'0')}`);
}

// Stream 0 should point to channel K (keyboard/screen)
// Check STRMS area
const strms = 0x5C10; // Streams area
console.log('\nStream pointers (STRMS):');
for (let stream = -3; stream <= 3; stream++) {
  const offset = (stream + 3) * 2;
  const ptr = memory.read(strms + offset) + memory.read(strms + offset + 1) * 256;
  console.log(`  Stream ${stream}: offset=0x${ptr.toString(16)}`);
}

// Print current channel output routine address
if (curchl > 0 && curchl < 0xFFFF) {
  const outAddr = memory.read(curchl) + memory.read(curchl + 1) * 256;
  const inAddr = memory.read(curchl + 2) + memory.read(curchl + 3) * 256;
  console.log('\nCurrent channel routines:');
  console.log(`  Output routine: 0x${outAddr.toString(16)}`);
  console.log(`  Input routine: 0x${inAddr.toString(16)}`);
}

// Check ATTR_P (permanent attribute)
console.log('\nATTR_P (permanent attr) = 0x' + memory.read(0x5C8D).toString(16));
console.log('ATTR_T (temp attr) = 0x' + memory.read(0x5C8F).toString(16));
console.log('BORDCR (border color) = 0x' + memory.read(0x5C48).toString(16));

// Check DF_CC (display file current position)
const dfcc = memory.read(0x5C84) + memory.read(0x5C85) * 256;
console.log('DF_CC (display position) = 0x' + dfcc.toString(16));

// Check S_POSN (print position)
const sposn_col = memory.read(0x5C88);
const sposn_row = memory.read(0x5C89);
console.log('S_POSN (col,row) = (' + sposn_col + ',' + sposn_row + ')');

