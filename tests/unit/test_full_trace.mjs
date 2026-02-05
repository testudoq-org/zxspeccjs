// Detailed step-by-step trace after key consumption
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

// Press 'k' (row 5, bit 2)
keyMatrix[5] = 0xFF & ~0x04;
console.log('Pressed K');

// Run until we hit 0x10BC (PUSH AF after key consumption)
let found = false;
for (let step = 0; step < 200000 && !found; step++) {
    if (cpu.PC === 0x10BC) {
        found = true;
        console.log(`\nHit 0x10BC at step ${step}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

if (!found) {
    console.log('Never hit 0x10BC');
    process.exit(1);
}

// Release key immediately
keyMatrix[5] = 0xFF;
console.log('Released K');

console.log(`\nA=0x${cpu.A.toString(16)} (should be 0xF1 for LIST)`);

// Now trace each step for 500 steps
console.log('\nStep-by-step trace:');
for (let i = 0; i < 500; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Get SP for CALL/RET tracking
    const sp = cpu.SP;
    
    let desc = '';
    if (opcode === 0xCD) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `CALL 0x${addr.toString(16)}`;
    } else if (opcode === 0xC9) {
        desc = `RET`;
    } else if (opcode === 0xD7) {
        desc = `RST 10 (print A)`;
    } else if (opcode === 0xC4) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `CALL NZ 0x${addr.toString(16)}`;
    } else if (opcode === 0xCC) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `CALL Z 0x${addr.toString(16)}`;
    } else if (opcode === 0xC0) {
        desc = `RET NZ`;
    } else if (opcode === 0xC8) {
        desc = `RET Z`;
    } else if (opcode === 0xF1) {
        desc = `POP AF`;
    } else if (opcode === 0xFE) {
        const val = memory.read(pc+1);
        desc = `CP 0x${val.toString(16)}`;
    }
    
    if (i < 100 || desc.includes('CALL') || desc.includes('RET') || desc.includes('RST') || pc === 0x0010 || pc === 0x09F4 || pc === 0x0AD9) {
        console.log(`${i}: PC=0x${pc.toString(16).padStart(4,'0')} op=0x${opcode.toString(16).padStart(2,'0')} SP=0x${sp.toString(16)} A=0x${cpu.A.toString(16).padStart(2,'0')} ${desc}`);
    }
    
    cpu.step();
}

console.log('\n...continued...');
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
