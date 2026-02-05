/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace what's at the interrupt vector and what happens when it runs
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

// Print ROM at 0x0038 (interrupt handler)
console.log('=== ROM at 0x0038 (Interrupt handler) ===');
for (let addr = 0x0038; addr < 0x0070; addr++) {
    const byte = memory.read(addr);
    let desc = '';
    switch (byte) {
        case 0xF5: desc = 'PUSH AF'; break;
        case 0xC5: desc = 'PUSH BC'; break;
        case 0xD5: desc = 'PUSH DE'; break;
        case 0xE5: desc = 'PUSH HL'; break;
        case 0xF1: desc = 'POP AF'; break;
        case 0xC1: desc = 'POP BC'; break;
        case 0xD1: desc = 'POP DE'; break;
        case 0xE1: desc = 'POP HL'; break;
        case 0xFB: desc = 'EI'; break;
        case 0xC9: desc = 'RET'; break;
        case 0xED: desc = '(ED prefix)'; break;
        case 0xFD: desc = '(FD prefix)'; break;
        case 0xDD: desc = '(DD prefix)'; break;
        case 0xCD: desc = 'CALL nn'; break;
        case 0xC3: desc = 'JP nn'; break;
        case 0x2A: desc = 'LD HL,(nn)'; break;
        case 0x22: desc = 'LD (nn),HL'; break;
        case 0x3E: desc = 'LD A,n'; break;
    }
    console.log(`  0x${addr.toString(16)}: ${byte.toString(16).padStart(2, '0')} ${desc}`);
}

// Print what's at address 0x0400 (where our trace showed we ended up)
console.log('\n=== ROM at 0x0400 ===');
for (let addr = 0x0400; addr < 0x0420; addr++) {
    console.log(`  0x${addr.toString(16)}: ${memory.read(addr).toString(16).padStart(2, '0')}`);
}

// Print what's at 0x046C (where the RST 08 was)
console.log('\n=== ROM at 0x046C ===');
for (let addr = 0x0460; addr < 0x0480; addr++) {
    console.log(`  0x${addr.toString(16)}: ${memory.read(addr).toString(16).padStart(2, '0')}`);
}

// Now let's trace the interrupt execution step by step
const TSTATES_PER_FRAME = 69888;
let frameCount = 0;
let foundInterrupt = false;

console.log('\n=== Running to first interrupt ===');

// Run until just before interrupt would occur
while (!foundInterrupt && frameCount < 25) {
    let tstates = 0;
    while (tstates < TSTATES_PER_FRAME) {
        tstates += cpu.step();
    }
    
    // Check if IFF1 is true (interrupts enabled)
    if (cpu.IFF1) {
        foundInterrupt = true;
        console.log(`Frame ${frameCount}: IFF1 is true, about to generate interrupt`);
        console.log(`  PC before interrupt: 0x${cpu.PC.toString(16)}`);
        console.log(`  SP before interrupt: 0x${cpu.SP.toString(16)}`);
        
        // Request interrupt
        cpu.requestInterrupt();
        
        console.log('\n=== Stepping through interrupt handler ===');
        // Step through the interrupt handler
        for (let i = 0; i < 50; i++) {
            const pc = cpu.PC;
            const opcode = memory.read(pc);
            const byte1 = memory.read(pc + 1);
            const byte2 = memory.read(pc + 2);
            
            console.log(`Step ${i}: PC=0x${pc.toString(16).padStart(4,'0')} [${opcode.toString(16).padStart(2,'0')} ${byte1.toString(16).padStart(2,'0')} ${byte2.toString(16).padStart(2,'0')}] SP=0x${cpu.SP.toString(16)} A=0x${cpu.A.toString(16)} IFF1=${cpu.IFF1}`);
            
            cpu.step();
            
            // Stop if we hit RST 08
            if (cpu.PC === 0x0008) {
                console.log('>>> Hit RST 08 (error handler)!');
                const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
                console.log(`>>> Return address: 0x${retAddr.toString(16)}`);
                break;
            }
            
            // Stop if we've returned from interrupt
            if (pc === 0x0052 && opcode === 0xC9) {
                console.log('>>> RET from interrupt handler');
                break;
            }
        }
    }
    
    frameCount++;
}

