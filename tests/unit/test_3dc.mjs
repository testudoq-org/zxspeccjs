// Trace after 0x3DC (JP NZ)
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

keyMatrix[1] = 0xFF & ~0x01;

// Run until 0x3DC (JP NZ)
console.log('Looking for 0x3DC...');
for (let step = 0; step < 50000; step++) {
    if (cpu.PC === 0x03DC) {
        console.log(`Hit 0x03DC at step ${step}`);
        console.log(`B=0x${cpu.B.toString(16)}, Z=${(cpu.F & 0x40) ? 'set' : 'clear'}`);
        
        // Trace next 10 instructions
        for (let i = 0; i < 10; i++) {
            const pc = cpu.PC;
            const op = memory.read(pc);
            const z = (cpu.F & 0x40) ? 'Z' : '';
            console.log(`  ${i}: PC=0x${pc.toString(16)} op=0x${op.toString(16)} B=0x${cpu.B.toString(16)} [${z}]`);
            cpu.step();
        }
        break;
    }
    cpu.step();
}

keyMatrix[1] = 0xFF;
