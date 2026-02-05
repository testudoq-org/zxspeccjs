/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Check what key value the ROM actually reads
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
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
console.log('MODE (0x5C41) = 0x' + memory.read(0x5C41).toString(16));

// Press 'k' (row 5, bit 2) according to ZX Spectrum keyboard layout
console.log('\nK key is row 6, bit 2 (not row 5!)');

keyMatrix[6] = 0xFF & ~0x04; // K is row 6, bit 2
console.log('Pressed K (corrected: row 6, bit 2)');

// Run a few frames
for (let frame = 0; frame < 5; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('LASTK (0x5C08) = 0x' + memory.read(0x5C08).toString(16));
console.log('FLAGS (0x5C3B) = 0x' + memory.read(0x5C3B).toString(16));

// Release key
keyMatrix[6] = 0xFF;
console.log('Released K');

// Run more frames
for (let frame = 0; frame < 10; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Check screen
let screenWrites = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) screenWrites++;
}
console.log(`\nNon-zero bytes in display file: ${screenWrites}`);