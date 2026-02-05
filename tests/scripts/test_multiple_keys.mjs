/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// test_multiple_keys.mjs - Test multiple key presses
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
memory._debugEnabled = false;
const cpu = new Z80(memory);

let keyMatrix = Array(8).fill(0xFF);

// Key mappings: [row, bit]
const KEY_MAP = {
    '1': [3, 0], '2': [3, 1], '3': [3, 2], '4': [3, 3], '5': [3, 4],
    '6': [4, 4], '7': [4, 3], '8': [4, 2], '9': [4, 1], '0': [4, 0],
    'Q': [2, 0], 'W': [2, 1], 'E': [2, 2], 'R': [2, 3], 'T': [2, 4],
    'A': [1, 0], 'S': [1, 1], 'D': [1, 2], 'F': [1, 3], 'G': [1, 4],
    'P': [5, 0], 'O': [5, 1], 'I': [5, 2], 'U': [5, 3], 'Y': [5, 4],
    'ENTER': [6, 0], 'L': [6, 1], 'K': [6, 2], 'J': [6, 3], 'H': [6, 4],
    'SPACE': [7, 0], 'M': [7, 2], 'N': [7, 3], 'B': [7, 4],
    'CAPS': [0, 0], 'Z': [0, 1], 'X': [0, 2], 'C': [0, 3], 'V': [0, 4],
};

function pressKey(key) {
    const mapping = KEY_MAP[key.toUpperCase()];
    if (mapping) {
        const [row, bit] = mapping;
        keyMatrix[row] &= ~(1 << bit);
    }
}

function releaseKey(key) {
    const mapping = KEY_MAP[key.toUpperCase()];
    if (mapping) {
        const [row, bit] = mapping;
        keyMatrix[row] |= (1 << bit);
    }
}

function releaseAllKeys() {
    keyMatrix = Array(8).fill(0xFF);
}

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

console.log('=== Multiple Keys Test ===\n');

// Boot
console.log('1. Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Test several keys
const testKeys = ['A', 'S', 'D', 'SPACE', '1', '2'];
let totalRst10 = 0;

for (const key of testKeys) {
    console.log(`\n2. Testing key "${key}"...`);
    releaseAllKeys();
    pressKey(key);
    
    let rst10Hits = 0;
    for (let i = 0; i < 100000; i++) {
        const pc = cpu.PC;
        cpu.step();
        if (pc === 0x0010) rst10Hits++;
        
        if (i === 50000) releaseKey(key);
        if (i % 70000 === 0 && cpu.IFF1) cpu.intRequested = true;
    }
    
    console.log(`   RST 10 calls: ${rst10Hits}`);
    totalRst10 += rst10Hits;
}

releaseAllKeys();

console.log(`\n3. Total RST 10 calls across all keys: ${totalRst10}`);

if (totalRst10 >= testKeys.length) {
    console.log('\n✓ SUCCESS: All keys produced output!');
} else {
    console.log('\n✗ FAIL: Some keys did not produce output');
}