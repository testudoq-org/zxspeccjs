// Debug keyboard scanning - trace what values are generated
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
memory._debugEnabled = false;
const cpu = new Z80(memory);

let keyMatrix = Array(8).fill(0xFF);

const LASTK_ADDR = 0x5C08;
const FLAGS_ADDR = 0x5C3B;

let lastLastk = 0;
let lastkWrites = [];

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

// Intercept writes to track LASTK changes
const originalWrite = memory.write.bind(memory);
memory.write = (addr, val) => {
    if (addr === LASTK_ADDR && val !== lastLastk) {
        lastkWrites.push({ val, pc: cpu.PC, step: cpu.tstates });
        lastLastk = val;
    }
    return originalWrite(addr, val);
};

cpu.reset();

console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.');
console.log('Initial LASTK =', memory.read(LASTK_ADDR).toString(16));

lastkWrites = []; // Clear boot writes

// Press 'A' (row 1, bit 0)
keyMatrix[1] = 0xFF & ~0x01;
console.log('\nPressed A (row 1, bit 0)');

// Run some steps and track LASTK changes
for (let frame = 0; frame < 5; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log(`\nLASTK writes after pressing A:`);
for (const w of lastkWrites.slice(0, 10)) {
    console.log(`  LASTK = 0x${w.val.toString(16)} at PC=0x${w.pc.toString(16)}`);
}
console.log(`Final LASTK = 0x${memory.read(LASTK_ADDR).toString(16)}`);

// Now test the actual port reads
console.log('\n--- Port read test ---');
// Reset and test direct port reading
const testPort = (highByte) => {
    const port = (highByte << 8) | 0xFE;
    let result = 0xFF;
    for (let row = 0; row < 8; row++) {
        if ((highByte & (1 << row)) === 0) {
            result &= keyMatrix[row];
        }
    }
    return (result & 0x1F) | 0xE0;
};

// Row 1 should have A pressed
console.log(`Row 1 (A9=0, port 0xFDFE) with A pressed: 0x${testPort(0xFD).toString(16)}`);
console.log('Expected for A pressed (bit 0 clear): 0xFE (0b11111110 & 0x1F | 0xE0 = 0xEE, wait...)');
console.log('Actually: 0x1E | 0xE0 = 0xFE... no wait');

// Let me trace actual key values expected
// A pressed on row 1, bit 0 should give: row[1] = 0xFE (bit 0 clear)
// Result for port read should be: (0xFE & 0x1F) | 0xE0 = 0x1E | 0xE0 = 0xFE
// Actually 0xFE = 0b11111110, and 0xFE & 0x1F = 0x1E = 0b11110
// 0x1E | 0xE0 = 0b11110 | 0b11100000 = 0b11111110 = 0xFE

// Check what keyMatrix actually is:
console.log(`\nkeyMatrix[1] = 0x${keyMatrix[1].toString(16)}`);
console.log(`For A pressed, should be 0xFE (bit 0 clear)`);
