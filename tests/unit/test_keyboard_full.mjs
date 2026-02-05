/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// test_keyboard_full.mjs - Full keyboard test with port monitoring
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
memory._debugEnabled = false;
const cpu = new Z80(memory);

let keyMatrix = Array(8).fill(0xFF);

// Track port 0xFE writes (speaker/border)
let portWrites = [];
let lastSpeakerBit = 0;

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
    write: (port, value, tstates) => {
        if ((port & 0xFF) === 0xFE) {
            const speakerBit = (value >> 4) & 1;
            const borderColor = value & 0x07;
            
            if (speakerBit !== lastSpeakerBit) {
                portWrites.push({
                    pc: cpu.PC,
                    value,
                    speaker: speakerBit,
                    border: borderColor,
                    tstates
                });
                lastSpeakerBit = speakerBit;
            }
        }
    }
};

cpu.reset();

console.log('=== Full Keyboard Test ===\n');

// Boot
console.log('1. Booting (100 frames)...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}
console.log(`   Boot complete. Speaker toggles during boot: ${portWrites.length}`);

// Check CHARS pointer
const charsLo = memory.read(0x5C36);
const charsHi = memory.read(0x5C37);
const charsPtr = (charsHi << 8) | charsLo;
console.log(`   CHARS pointer: 0x${charsPtr.toString(16).padStart(4, '0')}`);

// Clear port writes from boot
portWrites = [];
lastSpeakerBit = 0;

// Press 'A' key
console.log('\n2. Pressing "A" key...');
keyMatrix[1] = 0xFF & ~0x01;

// Run while key is pressed
let rst10Hits = 0;
for (let i = 0; i < 200000; i++) {
    const pc = cpu.PC;
    cpu.step();
    
    if (pc === 0x0010) rst10Hits++;
    
    if (i === 100000) {
        console.log('\n3. Releasing key...');
        keyMatrix[1] = 0xFF;
    }
    
    if (i % 70000 === 0 && cpu.IFF1) {
        cpu.intRequested = true;
    }
}

console.log(`\n4. Results:`);
console.log(`   RST 10 (print) calls: ${rst10Hits}`);
console.log(`   Speaker toggles during keypress: ${portWrites.length}`);

if (portWrites.length > 0 && portWrites.length <= 20) {
    console.log('\n   Speaker toggle details:');
    portWrites.forEach((w, i) => {
        console.log(`     ${i+1}. PC=0x${w.pc.toString(16).padStart(4,'0')} speaker=${w.speaker} border=${w.border}`);
    });
} else if (portWrites.length > 20) {
    console.log(`\n   First 10 speaker toggles:`);
    portWrites.slice(0, 10).forEach((w, i) => {
        console.log(`     ${i+1}. PC=0x${w.pc.toString(16).padStart(4,'0')} speaker=${w.speaker} border=${w.border}`);
    });
}

// Check memory around CHARS writes
const chars36 = memory.read(0x5C36);
const chars37 = memory.read(0x5C37);
console.log(`\n   CHARS after keypress: 0x${chars37.toString(16).padStart(2,'0')}${chars36.toString(16).padStart(2,'0')}`);

// Check E_LINE for character added
const eLineLo = memory.read(0x5C59);
const eLineHi = memory.read(0x5C5A);
const eLine = (eLineHi << 8) | eLineLo;
const firstChar = memory.read(eLine);
console.log(`   E_LINE at 0x${eLine.toString(16).padStart(4,'0')}, first byte: 0x${firstChar.toString(16).padStart(2,'0')}`);

if (rst10Hits > 0) {
    console.log('\n✓ SUCCESS: Keyboard input is working!');
    if (portWrites.length > 0) {
        console.log('  Note: Speaker toggles occurred - this is normal ROM BEEPER routine');
    }
} else {
    console.log('\n✗ FAIL: No printing occurred');
}

