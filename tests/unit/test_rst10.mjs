/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace looking for RST 10 call
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

// Press 'A' (row 1, bit 0)
keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x0F3B (ED-LOOP entry with key)
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x0F3B) {
        console.log(`At 0x0F3B (ED-LOOP) A=0x${cpu.A.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key 
keyMatrix[1] = 0xFF;

// Now trace looking for RST 10 or key processing routines
const watchPoints = {
    0x0010: 'RST 10 (print)',
    0x09F4: 'PRINT-A',
    0x0AD9: 'PO-CHAR',
    0x0F05: 'ADD-CHAR',
    0x0F38: 'ED-KEYS',
    0x0F81: 'EDITOR entry',
    0x1007: 'ED-ADD',
    0x100C: 'ED-ADD2',
    0x10A8: 'WAIT-KEY loop',
};

console.log('\nTracing from ED-LOOP (500 steps):');
for (let i = 0; i < 500; i++) {
    const pc = cpu.PC;
    
    if (watchPoints[pc]) {
        console.log(`Step ${i}: PC=0x${pc.toString(16)} ${watchPoints[pc]} A=0x${cpu.A.toString(16)}`);
    }
    
    // Also print if we're at RST 10
    if (pc === 0x0010) {
        console.log(`  ** RST 10 called with A=0x${cpu.A.toString(16)} **`);
    }
    
    cpu.step();
}

console.log(`\nAt step 500, PC=0x${cpu.PC.toString(16)}`);

// Run much more looking for RST 10
let rst10Count = 0;
for (let step = 0; step < 500000; step++) {
    if (cpu.PC === 0x0010) {
        rst10Count++;
        if (rst10Count === 1) {
            console.log(`\nFirst RST 10 at step ${step}, A=0x${cpu.A.toString(16)}`);
        }
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nTotal RST 10 calls in 500k steps: ${rst10Count}`);

// Check screen memory
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero bytes in screen: ${nonZero}`);

