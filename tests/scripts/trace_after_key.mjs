// trace_after_key.mjs - Trace after key press to see where we get stuck
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

// Boot with interrupts
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('=== Tracing after key press ===\n');

// Press "A" key
console.log('Pressing A key...');
keyMatrix[1] = 0xFF & ~0x01;

// Track key ROM addresses
const addresses = {
    0x02BF: 'KEYBOARD - start',
    0x0310: 'K-TEST - keyboard test',
    0x0F2C: 'EDITOR - editor entry',
    0x0F3B: 'ED-LOOP - editor loop',
    0x10A8: 'WAIT-KEY',
    0x0010: 'RST 10 - print',
    0x03B5: 'BEEPER',
    0x03F5: 'BEEPER end (RET)',
    0x0C41: 'ED-KEYS',
    0x0C3B: 'ED-EDIT',
    0x0C98: 'ADD-CHAR',
    0x0EE4: 'KEY-INPUT',
    0x0EDF: 'KEY-M&CL',
    0x0EFE: 'KEY-LINE',
};

let lastAddr = null;
let hits = {};
for (let key of Object.keys(addresses)) {
    hits[parseInt(key, 16)] = 0;
}

// Run 100k steps and track
for (let i = 0; i < 100000; i++) {
    const pc = cpu.PC;
    
    if (addresses[pc] && pc !== lastAddr) {
        hits[pc]++;
        if (hits[pc] <= 3) {
            console.log(`Step ${i}: 0x${pc.toString(16).padStart(4, '0')} - ${addresses[pc]}`);
        }
        lastAddr = pc;
    }
    
    cpu.step();
    
    // Release after 50k steps
    if (i === 50000) {
        console.log('\n--- Releasing key ---\n');
        keyMatrix[1] = 0xFF;
    }
    
    // Fire interrupt
    if (i % 70000 === 0 && cpu.IFF1) {
        cpu.intRequested = true;
    }
}

console.log('\n=== Hit counts ===');
for (let [addr, count] of Object.entries(hits)) {
    if (count > 0) {
        const name = addresses[parseInt(addr)] || '';
        console.log(`0x${parseInt(addr).toString(16).padStart(4, '0')} (${name}): ${count} hits`);
    }
}
