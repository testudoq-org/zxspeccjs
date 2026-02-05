/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace IX changes inside 0x03B5
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

keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x03B5 
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x03B5) {
        console.log(`At 0x03B5, IX=0x${cpu.IX.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

keyMatrix[1] = 0xFF;

// Trace step by step watching for IX changes
let lastIx = cpu.IX;
console.log('\nTracing IX changes:');
for (let i = 0; i < 100; i++) {
    const pc = cpu.PC;
    
    cpu.step();
    
    if (cpu.IX !== lastIx) {
        console.log(`Step ${i}: PC was 0x${pc.toString(16)}, IX changed from 0x${lastIx.toString(16)} to 0x${cpu.IX.toString(16)}`);
        lastIx = cpu.IX;
    }
}

console.log(`\nAfter 100 steps, IX=0x${cpu.IX.toString(16)}`);

// Check if we ever reach 0x03C1 (LD IX,0x03D1)
console.log('\nLooking for LD IX at 0x03C1...');
for (let i = 0; i < 10000; i++) {
    if (cpu.PC === 0x03C1) {
        console.log(`Found 0x03C1 at step ${i+100}, IX before=0x${cpu.IX.toString(16)}`);
        cpu.step();
        console.log(`After LD IX, IX=0x${cpu.IX.toString(16)}`);
        break;
    }
    cpu.step();
}

