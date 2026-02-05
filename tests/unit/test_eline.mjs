/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Check if character is added to E_LINE buffer
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
memory._debugEnabled = false;
const cpu = new Z80(memory);

let keyMatrix = Array(8).fill(0xFF);

cpu.io = {
    read: (port) => {
        if ((port & 0xFF) === 0xFE) {
            let result = 0xFF;
            const highByte = (port >> 8) & 0xFF;
            for (let row = 0; row < 8; row++) {
                if ((highByte & (1 << row)) === 0) {
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

for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.');

// Check E_LINE before key press
let eLine = memory.read(0x5C59) | (memory.read(0x5C5A) << 8);
console.log(`\nBefore key: E_LINE=0x${eLine.toString(16)}`);
let lineBytes = [];
for (let i = 0; i < 10; i++) lineBytes.push(memory.read(eLine + i).toString(16).padStart(2,'0'));
console.log(`E_LINE content: ${lineBytes.join(' ')}`);

// Press 'A' and release quickly
keyMatrix[1] = 0xFF & ~0x01;
console.log('\nPressed A');

// Run a few frames
for (let frame = 0; frame < 3; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Release
keyMatrix[1] = 0xFF;
console.log('Released A');

// Run more frames
for (let frame = 0; frame < 10; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Check E_LINE after
eLine = memory.read(0x5C59) | (memory.read(0x5C5A) << 8);
console.log(`\nAfter key: E_LINE=0x${eLine.toString(16)}`);
lineBytes = [];
for (let i = 0; i < 10; i++) lineBytes.push(memory.read(eLine + i).toString(16).padStart(2,'0'));
console.log(`E_LINE content: ${lineBytes.join(' ')}`);

// Check K_CUR (cursor position)
const kCur = memory.read(0x5C5B) | (memory.read(0x5C5C) << 8);
console.log(`K_CUR (cursor) = 0x${kCur.toString(16)}`);

// Check display file
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) nonZero++;
}
console.log(`\nNon-zero bytes in display file: ${nonZero}`);

