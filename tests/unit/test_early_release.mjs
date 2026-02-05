// Release key immediately after FLAGS bit 5 is set, before consumption
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

console.log('Boot complete. Pressing A...');

// Press 'A' (row 1, bit 0)
keyMatrix[1] = 0xFF & ~0x01;

// Run until FLAGS bit 5 is set (key detected)
let keyDetected = false;
for (let step = 0; step < 200000 && !keyDetected; step++) {
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
    
    if (memory.read(0x5C3B) & 0x20) {
        keyDetected = true;
        console.log(`Key detected at step ${step}, LASTK=0x${memory.read(0x5C08).toString(16)}`);
        // Release key immediately!
        keyMatrix[1] = 0xFF;
        console.log('Key released');
    }
}

// Now run a lot more and track print routines
let rst10Hits = 0;
let addCharHits = 0;

console.log('\nRunning 500k more steps...');
for (let step = 0; step < 500000; step++) {
    if (cpu.PC === 0x0010) rst10Hits++;
    if (cpu.PC === 0x0F05) addCharHits++;
    
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nRST 10 hits: ${rst10Hits}`);
console.log(`ADD-CHAR (0x0F05) hits: ${addCharHits}`);

// Check screen
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero bytes in screen: ${nonZero}`);

// Check edit line buffer (E_LINE at 0x5C59-5C5A points to it)
const eLine = memory.read(0x5C59) | (memory.read(0x5C5A) << 8);
console.log(`\nE_LINE points to: 0x${eLine.toString(16)}`);
console.log(`First bytes at E_LINE: 0x${memory.read(eLine).toString(16)} 0x${memory.read(eLine+1).toString(16)} 0x${memory.read(eLine+2).toString(16)}`);
