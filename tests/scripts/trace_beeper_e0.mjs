/* eslint-disable no-console, no-undef, no-unused-vars */
// trace_beeper_e0.mjs - Trace flow around 0x3E0-0x3E7
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

// Run until we hit 0x3DF (after JP NZ), then trace
let found = false;
for (let i = 0; i < 50000 && !found; i++) {
    if (cpu.PC === 0x03DF) {
        console.log('Hit 0x3DF, tracing next 20 instructions:');
        for (let j = 0; j < 20; j++) {
            const pc = cpu.PC;
            const op = memory.read(pc);
            const a = cpu.A;
            const b = cpu.B;
            const c = cpu.C;
            const de = (cpu.D << 8) | cpu.E;
            const z = (cpu.F & 0x40) ? 'Z' : '';
            const s = (cpu.F & 0x80) ? 'S' : '';
            console.log(`  ${j}: PC=0x${pc.toString(16).padStart(4,'0')} op=0x${op.toString(16).padStart(2,'0')} A=${a.toString(16)} B=${b.toString(16)} C=${c.toString(16)} DE=${de.toString(16).padStart(4,'0')} [${z}${s}]`);
            cpu.step();
        }
        found = true;
    }
    cpu.step();
}

if (!found) {
    console.log('Never reached 0x3DF!');
}

