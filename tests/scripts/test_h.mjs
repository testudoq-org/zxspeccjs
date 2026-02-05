/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Check H register in beeper loop
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

// Run until 0x03E3 (LD B,H)
console.log('Looking for 0x03E3 (LD B,H)...');
for (let step = 0; step < 3000000; step++) {
    if (cpu.PC === 0x03E3) {
        console.log(`Hit 0x03E3 at step ${step}`);
        console.log(`H=0x${cpu.H.toString(16)}, L=0x${cpu.L.toString(16)}`);
        console.log(`B=0x${cpu.B.toString(16)} before LD B,H`);
        cpu.step();
        console.log(`B=0x${cpu.B.toString(16)} after LD B,H`);
        
        // Also check DE which seems to control duration
        console.log(`D=0x${cpu.D.toString(16)}, E=0x${cpu.E.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

keyMatrix[1] = 0xFF;
console.log(`\nFinal PC: 0x${cpu.PC.toString(16)}`);

// Trace what was passed to this routine
console.log('\nHL was set at 0x0F41 to 0x00C8 - let me verify H');
// HL=0x00C8 means H=0x00, L=0xC8
// That means B gets loaded with 0!
