/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Very detailed trace of what happens after EI
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

// Initialize system
const memory = new Memory({ model: '48k' });
memory.loadROM(ROM_DATA.bytes, 0);

const mockCanvas = {
    getContext: () => ({ 
        createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
        putImageData: () => {},
        imageSmoothingEnabled: false
    }),
    width: 256,
    height: 192,
    style: {}
};

const ula = new ULA(memory, mockCanvas);
const cpu = new Z80(memory, ula);
cpu.reset();
ula.attachCPU(cpu);

console.log('=== ROM bytes around EI at 0x1234 ===');
for (let addr = 0x1230; addr <= 0x1260; addr++) {
    const byte = memory.read(addr);
    console.log(`  0x${addr.toString(16)}: ${byte.toString(16).padStart(2, '0')}`);
}

// Run up to EI instruction
const TSTATES_PER_FRAME = 69888;
console.log('\n=== Running to just before EI ===');

let frameCount = 0;
let foundEI = false;

while (!foundEI && frameCount < 50) {
    let tstates = 0;
    while (tstates < TSTATES_PER_FRAME && !foundEI) {
        const pc = cpu.PC;
        
        if (pc === 0x1234) {
            foundEI = true;
            console.log(`\nReached EI at 0x1234 in frame ${frameCount}`);
            console.log(`CPU state before EI:`);
            console.log(`  A: 0x${cpu.A.toString(16)}`);
            console.log(`  B: 0x${cpu.B.toString(16)}, C: 0x${cpu.C.toString(16)}`);
            console.log(`  D: 0x${cpu.D.toString(16)}, E: 0x${cpu.E.toString(16)}`);
            console.log(`  H: 0x${cpu.H.toString(16)}, L: 0x${cpu.L.toString(16)}`);
            console.log(`  IX: 0x${cpu.IX.toString(16)}`);
            console.log(`  IY: 0x${cpu.IY.toString(16)}`);
            console.log(`  SP: 0x${cpu.SP.toString(16)}`);
            console.log(`  IFF1: ${cpu.IFF1}, IFF2: ${cpu.IFF2}`);
            break;
        }
        
        tstates += cpu.step();
    }
    if (!foundEI) frameCount++;
}

// Now step through the next instructions one at a time
console.log('\n=== Stepping through instructions starting at EI ===');

for (let i = 0; i < 30; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    const byte1 = memory.read(pc + 1);
    const byte2 = memory.read(pc + 2);
    const byte3 = memory.read(pc + 3);
    
    let instrStr = `${opcode.toString(16).padStart(2, '0')} ${byte1.toString(16).padStart(2, '0')} ${byte2.toString(16).padStart(2, '0')} ${byte3.toString(16).padStart(2, '0')}`;
    
    console.log(`Step ${i}: PC=0x${pc.toString(16).padStart(4, '0')} [${instrStr}] A=0x${cpu.A.toString(16).padStart(2, '0')} HL=0x${(cpu.H * 256 + cpu.L).toString(16).padStart(4, '0')} IFF1=${cpu.IFF1}`);
    
    const prevPC = cpu.PC;
    cpu.step();
    const newPC = cpu.PC;
    
    // Check if PC jumped unexpectedly
    if (newPC === 0x0008) {
        // We hit RST 08 error handler
        const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
        console.log(`  >>> Jumped to RST 08 (error handler)`);
        console.log(`  >>> Return address on stack: 0x${retAddr.toString(16)}`);
        
        // The error code is the byte at the return address
        const errCode = memory.read(retAddr);
        console.log(`  >>> Error code: 0x${errCode.toString(16)} (${errCode})`);
        
        // Error codes: 0x00 = OK, 0x01 = NEXT without FOR, etc.
        // In the ZX Spectrum ROM, the error code is stored at the return address
    }
    
    // Check for other unexpected jumps
    if (newPC < 0x0040 && newPC !== prevPC + 1 && newPC !== prevPC + 2 && newPC !== prevPC + 3 && newPC !== prevPC + 4) {
        console.log(`  >>> Jumped to low address: 0x${newPC.toString(16)}`);
    }
    
    // Stop if we hit the error handler
    if (newPC === 0x0008 || cpu.PC === 0x0008) {
        break;
    }
}

console.log(`\nFinal state:`);
console.log(`  PC: 0x${cpu.PC.toString(16)}`);
console.log(`  SP: 0x${cpu.SP.toString(16)}`);
console.log(`  IFF1: ${cpu.IFF1}`);

