/**
 * Trace the keyboard scan loop more carefully
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

// Print the keyboard scan routine at 0x028E
console.log('=== ROM at 0x028E (KEY_SCAN routine) ===');
for (let addr = 0x028E; addr < 0x02C0; addr++) {
    const byte = memory.read(addr);
    console.log(`  0x${addr.toString(16)}: ${byte.toString(16).padStart(2, '0')}`);
}

// Now manually set up CPU state to be just before the keyboard scan
// and trace through the routine
console.log('\n=== Manual trace of keyboard scan ===');

// Set up CPU state similar to what we see in the interrupt
cpu.PC = 0x028E;
cpu.SP = 0x3F46;
cpu.A = 0x03;
cpu.B = 0;
cpu.C = 0;
cpu.D = 0;
cpu.E = 0;
cpu.H = 0;
cpu.L = 0;
cpu.F = 0;

console.log('Starting at 0x028E (KEY_SCAN)...\n');

for (let i = 0; i < 100; i++) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    const byte1 = memory.read(pc + 1);
    const byte2 = memory.read(pc + 2);
    
    let instrDesc = '';
    // Decode some key instructions
    if (opcode === 0x2E) instrDesc = `LD L,0x${byte1.toString(16)}`;
    else if (opcode === 0x11) instrDesc = `LD DE,0x${(byte2 * 256 + byte1).toString(16)}`;
    else if (opcode === 0x01) instrDesc = `LD BC,0x${(byte2 * 256 + byte1).toString(16)}`;
    else if (opcode === 0xED && byte1 === 0x78) instrDesc = 'IN A,(C)';
    else if (opcode === 0x2F) instrDesc = 'CPL';
    else if (opcode === 0xE6) instrDesc = `AND 0x${byte1.toString(16)}`;
    else if (opcode === 0x28) instrDesc = `JR Z,${(byte1 > 127 ? byte1 - 256 : byte1)}`;
    else if (opcode === 0x38) instrDesc = `JR C,${(byte1 > 127 ? byte1 - 256 : byte1)}`;
    else if (opcode === 0x2D) instrDesc = 'DEC L';
    else if (opcode === 0xCB && byte1 === 0x00) instrDesc = 'RLC B';
    else if (opcode === 0x67) instrDesc = 'LD H,A';
    else if (opcode === 0x7A) instrDesc = 'LD A,D';
    else if (opcode === 0x07) instrDesc = 'RLCA';
    else if (opcode === 0xC9) instrDesc = 'RET';
    else if (opcode === 0xCB && byte1 === 0x04) instrDesc = 'RLC H';
    else if (opcode === 0x17) instrDesc = 'RLA';
    else if (opcode === 0x30) instrDesc = `JR NC,${(byte1 > 127 ? byte1 - 256 : byte1)}`;
    
    const carryFlag = (cpu.F & 0x01) !== 0 ? 'C=1' : 'C=0';
    const zeroFlag = (cpu.F & 0x40) !== 0 ? 'Z=1' : 'Z=0';
    
    console.log(`Step ${i.toString().padStart(2)}: PC=0x${pc.toString(16).padStart(4,'0')} [${opcode.toString(16).padStart(2,'0')} ${byte1.toString(16).padStart(2,'0')}] A=0x${cpu.A.toString(16).padStart(2,'0')} B=0x${cpu.B.toString(16).padStart(2,'0')} L=0x${cpu.L.toString(16).padStart(2,'0')} ${carryFlag} ${zeroFlag} ${instrDesc}`);
    
    cpu.step();
    
    // Stop if we return or hit error
    if (opcode === 0xC9) {
        console.log('RET encountered');
        break;
    }
    if (cpu.PC === 0x0008) {
        console.log('Hit RST 08 (error)');
        break;
    }
    
    // Stop if we've been in a tight loop too long
    if (i > 95) {
        console.log('... stopping after 95 steps');
        break;
    }
}
