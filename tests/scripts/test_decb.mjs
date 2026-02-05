/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace DEC B at 0x3DB
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

for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

keyMatrix[1] = 0xFF & ~0x01;

// Run until first 0x3DB (DEC B)
console.log('Looking for first 0x3DB...');
for (let step = 0; step < 100000; step++) {
    if (cpu.PC === 0x03DB) {
        console.log(`Hit 0x03DB at step ${step}`);
        console.log(`B before DEC = 0x${cpu.B.toString(16)}`);
        console.log(`Z flag before = ${(cpu.F & 0x40) ? 'set' : 'clear'}`);
        cpu.step();
        console.log(`B after DEC = 0x${cpu.B.toString(16)}`);
        console.log(`Z flag after = ${(cpu.F & 0x40) ? 'set' : 'clear'}`);
        break;
    }
    cpu.step();
}

// Now check next few hits of 0x3DB
let count = 0;
for (let step = 0; step < 100000 && count < 5; step++) {
    if (cpu.PC === 0x03DB) {
        count++;
        console.log(`\nHit 0x03DB again (#${count}), B=0x${cpu.B.toString(16)}`);
        cpu.step();
        console.log(`After DEC B, B=0x${cpu.B.toString(16)}, Z=${(cpu.F & 0x40) ? 'set' : 'clear'}`);
    } else {
        cpu.step();
    }
}

console.log('Done.');