/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace execution - press and RELEASE key
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

console.log('Boot complete. IY=0x' + cpu.IY.toString(16));

// Press 'k' (row 5, bit 2)
keyMatrix[5] = 0xFF & ~0x04;
console.log('\nPressed K');

// Run for a short while (one frame)
for (let i = 0; i < 70000; i++) cpu.step();
if (cpu.IFF1) cpu.intRequested = true;

// Now RELEASE the key
keyMatrix[5] = 0xFF;
console.log('Released K');

// Track print routine hits
let rst10Hits = 0;
let poCharHits = 0;

// Run more frames
for (let frame = 0; frame < 10; frame++) {
    for (let i = 0; i < 70000; i++) {
        const pc = cpu.PC;
        
        // Track print routines
        if (pc === 0x0010) rst10Hits++;
        if (pc === 0x0AD9) poCharHits++;
        
        cpu.step();
    }
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log(`\nAfter 10 frames with key released:`);
console.log(`RST 10 (0x0010) hits: ${rst10Hits}`);
console.log(`PO-CHAR (0x0AD9) hits: ${poCharHits}`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);

// Check screen memory for non-zero (should have character printed)
let screenWrites = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) screenWrites++;
}
console.log(`Non-zero bytes in display file: ${screenWrites}`);

// Also check what ROM routine we're in
console.log(`\nA=0x${cpu.A.toString(16)}, BC=0x${cpu.BC.toString(16)}, DE=0x${cpu.DE.toString(16)}, HL=0x${cpu.HL.toString(16)}`);

