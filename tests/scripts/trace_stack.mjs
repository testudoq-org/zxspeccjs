/**
 * Trace the stack during keyboard scan to understand RET Z problem
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

const TSTATES_PER_FRAME = 69888;

// Run to just before first interrupt
console.log('=== Running to first interrupt ===');
for (let frame = 0; frame < 25; frame++) {
    let tstates = 0;
    while (tstates < TSTATES_PER_FRAME) {
        tstates += cpu.step();
    }
    
    if (cpu.IFF1) {
        console.log(`Frame ${frame}: IFF1=true, ready for interrupt`);
        console.log(`  PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}`);
        
        // Check what's on stack
        console.log(`  Stack content:`);
        for (let i = 0; i < 8; i += 2) {
            const addr = cpu.SP + i;
            const val = memory.read(addr) | (memory.read(addr + 1) << 8);
            console.log(`    SP+${i}: 0x${val.toString(16)}`);
        }
        
        // Request interrupt  
        cpu.requestInterrupt();
        
        // Now trace through the interrupt handler carefully
        console.log('\n=== Tracing interrupt handler with stack info ===');
        
        for (let step = 0; step < 150; step++) {
            const pc = cpu.PC;
            const opcode = memory.read(pc);
            const byte1 = memory.read(pc + 1);
            const byte2 = memory.read(pc + 2);
            
            // Show stack top value
            const stackTop = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
            
            let instrDesc = '';
            if (opcode === 0xF5) instrDesc = 'PUSH AF';
            else if (opcode === 0xE5) instrDesc = 'PUSH HL';
            else if (opcode === 0xC5) instrDesc = 'PUSH BC';
            else if (opcode === 0xD5) instrDesc = 'PUSH DE';
            else if (opcode === 0xF1) instrDesc = 'POP AF';
            else if (opcode === 0xE1) instrDesc = 'POP HL';
            else if (opcode === 0xC1) instrDesc = 'POP BC';
            else if (opcode === 0xD1) instrDesc = 'POP DE';
            else if (opcode === 0xCD) instrDesc = `CALL 0x${(byte1 | (byte2 << 8)).toString(16)}`;
            else if (opcode === 0xC9) instrDesc = 'RET';
            else if (opcode === 0xC8) instrDesc = 'RET Z';
            else if (opcode === 0xC0) instrDesc = 'RET NZ';
            else if (opcode === 0xFB) instrDesc = 'EI';
            
            // Only show interesting steps
            if (instrDesc || pc === 0x028E || pc === 0x02B2 || pc === 0x02BF) {
                console.log(`Step ${step.toString().padStart(3)}: PC=0x${pc.toString(16).padStart(4,'0')} [${opcode.toString(16).padStart(2,'0')} ${byte1.toString(16).padStart(2,'0')}] SP=0x${cpu.SP.toString(16)} stackTop=0x${stackTop.toString(16).padStart(4,'0')} ${instrDesc}`);
            }
            
            cpu.step();
            
            // Stop when we return from interrupt (hit EI and then RET)
            if (pc === 0x0052 && opcode === 0xC9) {
                console.log('>>> Returned from interrupt handler');
                break;
            }
            
            // Stop if we hit an error
            if (cpu.PC === 0x0008) {
                console.log(`>>> ERROR! Hit RST 08`);
                const retAddr = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
                console.log(`>>> Stack top: 0x${retAddr.toString(16)}`);
                break;
            }
        }
        
        break;
    }
}
