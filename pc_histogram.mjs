// pc_histogram.mjs - Analyze where CPU spends time after key press
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

// PC histogram
let histogram = {};

// Press A key
console.log('Pressing A key...');
keyMatrix[1] = 0xFF & ~0x01;

// Run and collect histogram
for (let i = 0; i < 100000; i++) {
    const pc = cpu.PC;
    histogram[pc] = (histogram[pc] || 0) + 1;
    cpu.step();
    
    if (i === 50000) {
        keyMatrix[1] = 0xFF;
    }
    
    if (i % 70000 === 0 && cpu.IFF1) {
        cpu.intRequested = true;
    }
}

// Sort by count
const sorted = Object.entries(histogram)
    .map(([pc, count]) => [parseInt(pc), count])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

console.log('\nTop 30 PC addresses:');
for (let [pc, count] of sorted) {
    console.log(`0x${pc.toString(16).padStart(4, '0')}: ${count} (${(count/100000*100).toFixed(1)}%)`);
}

// ROM ranges
console.log('\nPC range analysis:');
const ranges = {
    'ISR (0x38)': 0,
    'ROM 0x0000-0x00FF (startup)': 0,
    'ROM 0x0300-0x0400 (keyboard/beeper)': 0,
    'ROM 0x0F00-0x1000 (editor)': 0,
    'ROM 0x1000-0x1100 (print/screen)': 0,
    'ROM other': 0,
    'RAM': 0,
};

for (let [pc, count] of Object.entries(histogram)) {
    pc = parseInt(pc);
    if (pc === 0x38) ranges['ISR (0x38)'] += count;
    else if (pc < 0x100) ranges['ROM 0x0000-0x00FF (startup)'] += count;
    else if (pc >= 0x300 && pc < 0x400) ranges['ROM 0x0300-0x0400 (keyboard/beeper)'] += count;
    else if (pc >= 0x0F00 && pc < 0x1000) ranges['ROM 0x0F00-0x1000 (editor)'] += count;
    else if (pc >= 0x1000 && pc < 0x1100) ranges['ROM 0x1000-0x1100 (print/screen)'] += count;
    else if (pc < 0x4000) ranges['ROM other'] += count;
    else ranges['RAM'] += count;
}

for (let [range, count] of Object.entries(ranges)) {
    console.log(`${range}: ${count} (${(count/100000*100).toFixed(1)}%)`);
}
