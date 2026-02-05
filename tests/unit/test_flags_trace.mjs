/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Detailed trace of 0x10C5-0x111B area
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

// Run until 0x10C4 (after CLS, about to POP AF)
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x10C4) {
        console.log('At 0x10C4 (POP AF)');
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Now step-by-step trace
console.log('Step-by-step from 0x10C4:');
for (let i = 0; i < 30; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    const flagC = (cpu.F & 1) ? 'C' : '';
    const flagZ = (cpu.F & 0x40) ? 'Z' : '';
    const flags = flagC + flagZ;
    
    console.log(`PC=0x${pc.toString(16).padStart(4,'0')} op=0x${opcode.toString(16).padStart(2,'0')} A=0x${cpu.A.toString(16).padStart(2,'0')} F=${flags || 'none'}`);
    
    cpu.step();
}

console.log(`\nNow at PC=0x${cpu.PC.toString(16)}`);

// Also release key at some point
keyMatrix[1] = 0xFF;

