// Trace if we ever return from 0x03B5 call to 0x0F47
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

// Press 'A'
keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x0F44 (CALL 0x03B5)
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x0F44) {
        console.log('At 0x0F44 (about to CALL 0x03B5)');
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key
keyMatrix[1] = 0xFF;
console.log('Key released');

// Now track if we ever reach 0x0F47 (after CALL returns)
let reached0F47 = false;
let reached0F4C = false; // CP 0x18
let reached0F81 = false; // EDITOR

for (let step = 0; step < 200000; step++) {
    const pc = cpu.PC;
    
    if (pc === 0x0F47 && !reached0F47) {
        reached0F47 = true;
        console.log(`Reached 0x0F47 (POP AF) at step ${step}, A=0x${cpu.A.toString(16)}`);
    }
    if (pc === 0x0F4C && !reached0F4C) {
        reached0F4C = true;
        console.log(`Reached 0x0F4C (CP 0x18) at step ${step}, A=0x${cpu.A.toString(16)}`);
    }
    if (pc === 0x0F81 && !reached0F81) {
        reached0F81 = true;
        console.log(`Reached 0x0F81 (EDITOR) at step ${step}`);
    }
    
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nAfter 200k steps:`);
console.log(`Reached 0x0F47: ${reached0F47}`);
console.log(`Reached 0x0F4C: ${reached0F4C}`);
console.log(`Reached 0x0F81: ${reached0F81}`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
