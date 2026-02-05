/* eslint-disable no-console, no-undef, no-unused-vars */
// trace_beeper_flow.mjs - Trace the BEEPER flow to find why it never exits
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

// Track specific addresses
let addr03E7 = 0;  // JR NZ,+9
let addr03E9 = 0;  // LD A,D
let addr03EA = 0;  // OR E
let addr03EB = 0;  // JR Z,+9 (EXIT!)
let addr03EC = 0;  // past JR Z
let addr03F2 = 0;  // target of JR NZ
let addr03F4 = 0;  // after DD E9
let addr03F5 = 0;  // DD E9 (JP IX)
let addr03F6 = 0;  // After BEEPER (RET?)

// Sample some DE values when at 0x03EA
let deSamples = [];

for (let i = 0; i < 500000; i++) {
    const pc = cpu.PC;
    
    if (pc === 0x03E7) addr03E7++;
    if (pc === 0x03E9) addr03E9++;
    if (pc === 0x03EA) {
        addr03EA++;
        if (deSamples.length < 10) {
            const de = (cpu.D << 8) | cpu.E;
            deSamples.push(de);
        }
    }
    if (pc === 0x03EB) addr03EB++;
    if (pc === 0x03EC) addr03EC++;
    if (pc === 0x03F2) addr03F2++;
    if (pc === 0x03F4) addr03F4++;
    if (pc === 0x03F5) addr03F5++;
    if (pc === 0x03F6) addr03F6++;
    
    cpu.step();
    
    if (i === 100000) {
        console.log('Releasing key...');
        keyMatrix[1] = 0xFF;
    }
    
    if (i % 70000 === 0 && cpu.IFF1) {
        cpu.intRequested = true;
    }
}

console.log('\nAddress hit counts:');
console.log(`0x03E7 (JR NZ): ${addr03E7}`);
console.log(`0x03E9 (LD A,D): ${addr03E9}`);
console.log(`0x03EA (OR E): ${addr03EA}`);
console.log(`0x03EB (JR Z - EXIT): ${addr03EB}`);
console.log(`0x03EC (after JR Z): ${addr03EC}`);
console.log(`0x03F2 (JR NZ target): ${addr03F2}`);
console.log(`0x03F4 (before JP IX): ${addr03F4}`);
console.log(`0x03F5 (JP IX): ${addr03F5}`);
console.log(`0x03F6 (after BEEPER): ${addr03F6}`);
console.log(`\nDE samples at OR E: ${deSamples.map(x => '0x' + x.toString(16).padStart(4,'0')).join(', ')}`);

