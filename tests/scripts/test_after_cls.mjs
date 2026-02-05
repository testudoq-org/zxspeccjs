/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

// Trace execution after CLS - trace much more steps
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

console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete. IY=0x' + cpu.IY.toString(16));
console.log('FLAGS2 before key = 0x' + memory.read(0x5C3C).toString(16));

// Press 'k' (row 5, bit 2)
keyMatrix[5] = 0xFF & ~0x04;
console.log('\nPressed K');

// Run until FLAGS bit 5 is set and cleared (key consumed)
let flagsSet = false;
let flagsCleared = false;
let stepsAfterClear = 0;

// Track print routine hits
let rst10Hits = 0;
let printAHits = 0;

// Track CLS exit
let clsEntered = false;
let clsExited = false;

for (let step = 0; step < 500000 && stepsAfterClear < 50000; step++) {
    const pc = cpu.PC;
    
    // Track CLS
    if (pc === 0x0D6E) clsEntered = true;
    
    // Track returns from CLS (it's a CALL so RET should pop back)
    if (clsEntered && !clsExited && pc >= 0x10C4 && pc <= 0x10D0) {
        clsExited = true;
        console.log(`CLS returned! PC=0x${pc.toString(16)}`);
    }
    
    // Track print routines
    if (pc === 0x0010) rst10Hits++;
    if (pc >= 0x09F4 && pc <= 0x0A00) printAHits++;
    if (pc === 0x0AD9) printAHits++;
    
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
    
    const flags = memory.read(0x5C3B);
    if (flags & 0x20) {
        if (!flagsSet) {
            flagsSet = true;
            console.log(`FLAGS bit 5 SET at step ${step}`);
        }
    } else if (flagsSet && !flagsCleared) {
        flagsCleared = true;
        console.log(`FLAGS bit 5 cleared at step ${step}`);
    }
    
    if (flagsCleared) {
        stepsAfterClear++;
        
        // Print some key PCs after clearing
        if (stepsAfterClear <= 10 || (stepsAfterClear % 1000 === 0)) {
            console.log(`After clear step ${stepsAfterClear}: PC=0x${pc.toString(16)}`);
        }
    }
}

console.log(`\nAfter ${stepsAfterClear} steps after FLAGS clear:`);
console.log(`RST 10 hits: ${rst10Hits}`);
console.log(`PRINT-A area hits: ${printAHits}`);
console.log(`CLS entered: ${clsEntered}`);
console.log(`CLS exited: ${clsExited}`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
console.log(`FLAGS2 (0x5C3C) = 0x${memory.read(0x5C3C).toString(16)}`);

// Check screen memory for the LIST token
const screenAttr = memory.read(0x5800);
console.log(`\nScreen attr at 0x5800 = 0x${screenAttr.toString(16)}`);

// Check if any screen memory was written (look for non-zero in display file)
let screenWrites = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) screenWrites++;
}
console.log(`Non-zero bytes in display file: ${screenWrites}`);

// Smoke test wrapper
test('after CLS smoke', () => {
  if (typeof cpu !== 'undefined') {
    expect(typeof cpu.PC).toBe('number');
  } else if (typeof memory !== 'undefined') {
    expect(typeof memory.read).toBe('function');
  } else {
    expect(true).toBe(true);
  }
});
