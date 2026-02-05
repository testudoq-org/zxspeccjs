// Trace what happens after key is consumed - longer trace
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

console.log('Boot complete.');

// Press 'A' (row 1, bit 0)
keyMatrix[1] = 0xFF & ~0x01;
console.log('Pressed A');

// Run until we hit 0x10BC (after key read)
for (let step = 0; step < 500000; step++) {
    if (cpu.PC === 0x10BC) {
        console.log(`Hit 0x10BC at step ${step}, A=0x${cpu.A.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key
keyMatrix[1] = 0xFF;
console.log('Released A');

// Trace step by step looking for specific routines
const routines = {
    0x10BC: 'PUSH AF (key consumed)',
    0x10C4: 'POP AF (after CLS check)',
    0x10C5: 'CP 0x20',
    0x10C7: 'JP C,0x10DB',
    0x10CA: 'CP 0xA5',
    0x10CC: 'JR NC,0x10DB',
    0x10CE: 'CP 0x80', 
    0x10D0: 'JR NC,0x10DB',
    0x10DB: 'Target of jumps',
    0x0010: 'RST 10 (print)',
    0x09F4: 'PRINT-A',
    0x0AD9: 'PO-CHAR',
    0x0D6E: 'CLS',
    0x0F81: 'EDITOR',
    0x0F05: 'ADD-CHAR',
    0x10A8: 'WAIT-KEY',
    0x1031: 'ED-ENTER',
};

let stepCount = 0;
let clsDone = false;

console.log('\nTracing execution after key consumed:');
for (let step = 0; step < 2000; step++) {
    const pc = cpu.PC;
    
    if (routines[pc]) {
        console.log(`Step ${stepCount}: PC=0x${pc.toString(16)} ${routines[pc]} A=0x${cpu.A.toString(16)}`);
    }
    
    if (pc === 0x0D6E) {
        // Skip CLS execution - just note it
        console.log('  (entering CLS, will skip details)');
        clsDone = false;
    }
    
    // Track when we return from CLS (back to 0x10C4)
    if (pc === 0x10C4 && !clsDone) {
        clsDone = true;
        console.log('  (CLS completed, continuing)');
    }
    
    stepCount++;
    cpu.step();
}

console.log(`\n... traced ${stepCount} steps`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);

// Now run more and check for print hits
let rst10Hits = 0;
for (let step = 0; step < 100000; step++) {
    if (cpu.PC === 0x0010) rst10Hits++;
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

console.log(`\nRST 10 hits in next 100k steps: ${rst10Hits}`);
