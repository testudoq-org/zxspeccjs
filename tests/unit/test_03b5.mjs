// Trace inside 0x03B5 to see why it never returns
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

for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Press 'A'
keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x03B5 (first entry)
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x03B5) {
        console.log('Entered 0x03B5');
        console.log(`SP=0x${cpu.SP.toString(16)}`);
        // Read return address from stack
        const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
        console.log(`Return address on stack: 0x${retAddr.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key
keyMatrix[1] = 0xFF;
console.log('Key released\n');

// Trace step by step
console.log('Tracing 0x03B5 (first 50 steps):');
for (let i = 0; i < 50; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    const sp = cpu.SP;
    
    // Check for RET instructions
    let desc = '';
    if (opcode === 0xC9) desc = 'RET';
    if (opcode === 0xC0) desc = 'RET NZ';
    if (opcode === 0xC8) desc = 'RET Z';
    if (opcode === 0xD0) desc = 'RET NC';
    if (opcode === 0xD8) desc = 'RET C';
    if (opcode === 0xE9) desc = 'JP (HL)';
    if (opcode === 0xED && memory.read(pc+1) === 0x45) desc = 'RETN';
    if (opcode === 0xED && memory.read(pc+1) === 0x4D) desc = 'RETI';
    
    console.log(`${i}: PC=0x${pc.toString(16).padStart(4,'0')} op=0x${opcode.toString(16).padStart(2,'0')} SP=0x${sp.toString(16)} ${desc}`);
    
    cpu.step();
}

// Continue looking for RET
console.log('\nLooking for RET in next 1000 steps...');
for (let i = 0; i < 1000; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (opcode === 0xC9 || opcode === 0xC0 || opcode === 0xC8 || 
        opcode === 0xD0 || opcode === 0xD8 || opcode === 0xE9) {
        console.log(`Found potential return at step ${i+50}: PC=0x${pc.toString(16)} op=0x${opcode.toString(16)}`);
    }
    
    cpu.step();
}

console.log(`\nFinal PC: 0x${cpu.PC.toString(16)}`);
