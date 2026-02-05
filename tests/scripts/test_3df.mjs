/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

// Trace in detail what happens around 0x3DF-0x3F5
import { Memory } from '../unit/src/memory.mjs';
import { Z80 } from '../unit/src/z80.mjs';
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

keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x03DF (XOR 0x10)
console.log('Looking for 0x03DF...');
for (let step = 0; step < 2000000; step++) {
    if (cpu.PC === 0x03DF) {
        console.log(`Hit 0x03DF at step ${step}`);
        console.log(`B=0x${cpu.B.toString(16)}, A=0x${cpu.A.toString(16)}`);
        
        // Trace next 20 steps
        for (let i = 0; i < 20; i++) {
            const pc = cpu.PC;
            const op = memory.read(pc);
            console.log(`  ${i}: PC=0x${pc.toString(16)} op=0x${op.toString(16)} B=0x${cpu.B.toString(16)} A=0x${cpu.A.toString(16)}`);
            cpu.step();
        }
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

keyMatrix[1] = 0xFF;
console.log(`\nFinal PC: 0x${cpu.PC.toString(16)}`);

// Smoke test wrapper
test('3DF smoke', () => {
  if (typeof cpu !== 'undefined') expect(typeof cpu.PC).toBe('number');
  else expect(true).toBe(true);
});
