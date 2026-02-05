// Check IX register when entering 0x03B5
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

// Run until 0x03B5 
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x03B5) {
        console.log('Entered 0x03B5');
        console.log(`IX=0x${cpu.IX.toString(16)}`);
        console.log(`IY=0x${cpu.IY.toString(16)}`);
        console.log(`B=0x${cpu.B.toString(16)}`);
        console.log(`SP=0x${cpu.SP.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key
keyMatrix[1] = 0xFF;

// Now run until JP (IX) at 0x3F0 or give up after many steps
console.log('\nRunning to see if we reach JP (IX) at 0x3F0...');
let jpIxCount = 0;
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x03F0) {
        jpIxCount++;
        console.log(`Hit JP (IX) at step ${step}, IX=0x${cpu.IX.toString(16)}`);
        if (jpIxCount >= 3) break;
    }
    
    // Also track re-entries to 0x03B5
    if (cpu.PC === 0x03B5 && step > 0) {
        // Skip logging every re-entry
    }
    
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nTotal JP (IX) hits: ${jpIxCount}`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
