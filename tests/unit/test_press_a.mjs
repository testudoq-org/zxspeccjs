/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Complete trace: press K, track CLS and printing
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

console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.');

// Press 'A' - simple letter (row 1, bit 0)
keyMatrix[1] = 0xFF & ~0x01; // A is row 1, bit 0
console.log('Pressed A (row 1, bit 0)');

// Run until we hit 0x10BC (key consumption point)
let found = false;
for (let step = 0; step < 500000 && !found; step++) {
    if (cpu.PC === 0x10BC) {
        found = true;
        console.log(`Hit 0x10BC at step ${step}`);
        console.log(`A register = 0x${cpu.A.toString(16)} (key value)`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

if (!found) {
    console.log('Never hit 0x10BC - checking FLAGS...');
    console.log('FLAGS (0x5C3B) = 0x' + memory.read(0x5C3B).toString(16));
    throw new Error('Never hit 0x10BC - check FLAGS');
}

// Now release the key immediately after it's been consumed
keyMatrix[1] = 0xFF;
console.log('Released A');

// Track key addresses
let rst10Hits = 0;
let poCharHits = 0;
let editorHits = 0;
let addCharHits = 0;

// Trace execution for many steps
for (let step = 0; step < 200000; step++) {
    const pc = cpu.PC;
    
    if (pc === 0x0010) rst10Hits++;
    if (pc === 0x0AD9) poCharHits++;
    if (pc === 0x0F81) editorHits++; // EDITOR
    if (pc === 0x0F05) addCharHits++; // ADD-CHAR
    
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nAfter 200k steps:`);
console.log(`RST 10 (0x0010) hits: ${rst10Hits}`);
console.log(`PO-CHAR (0x0AD9) hits: ${poCharHits}`);
console.log(`EDITOR (0x0F81) hits: ${editorHits}`);
console.log(`ADD-CHAR (0x0F05) hits: ${addCharHits}`);

// Check screen memory for non-zero pixels
let screenWrites = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) screenWrites++;
}
console.log(`\nNon-zero bytes in display file: ${screenWrites}`);

// Show some screen memory around likely cursor position
console.log('First 32 bytes of display file:');
let line = '';
for (let i = 0; i < 32; i++) {
    line += memory.read(0x4000 + i).toString(16).padStart(2,'0') + ' ';
}
console.log(line);

