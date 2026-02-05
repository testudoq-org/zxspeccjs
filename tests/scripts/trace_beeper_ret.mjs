// trace_beeper_ret.mjs - Check if BEEPER ever returns
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

// Boot
console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Pressing A key...');
keyMatrix[1] = 0xFF & ~0x01;

// Track BEEPER entry/exit and key scan
let beeperEnter = 0;
let beeperExit = 0;
let kScanHits = 0;
let waitKeyHits = 0;

for (let i = 0; i < 500000; i++) {
    const pc = cpu.PC;
    
    if (pc === 0x03B5) beeperEnter++;
    if (pc === 0x03F5) {
        beeperExit++;
        if (beeperExit <= 5) {
            console.log(`BEEPER exit #${beeperExit} at step ${i}`);
        }
    }
    if (pc === 0x028E) kScanHits++;  // KEY-SCAN
    if (pc === 0x10A8) waitKeyHits++;
    
    cpu.step();
    
    if (i === 100000) {
        console.log('Releasing key...');
        keyMatrix[1] = 0xFF;
    }
    
    if (i % 70000 === 0 && cpu.IFF1) {
        cpu.intRequested = true;
    }
}

console.log(`\nBEEPER entries: ${beeperEnter}`);
console.log(`BEEPER exits (0x03F5): ${beeperExit}`);
console.log(`KEY-SCAN hits: ${kScanHits}`);
console.log(`WAIT-KEY hits: ${waitKeyHits}`);
