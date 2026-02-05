/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Trace ED-LOOP execution step by step
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
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

// Run until 0x0F3B
for (let step = 0; step < 1000000; step++) {
    if (cpu.PC === 0x0F3B) {
        console.log(`At 0x0F3B A=0x${cpu.A.toString(16)}`);
        break;
    }
    cpu.step();
    if (cpu.IFF1 && (step % 70000 === 0)) cpu.intRequested = true;
}

// Release key 
keyMatrix[1] = 0xFF;

// Disassemble at each step
const disasm = (pc) => {
    const op = memory.read(pc);
    const b1 = memory.read(pc+1);
    const b2 = memory.read(pc+2);
    
    const ops = {
        0xF5: 'PUSH AF',
        0xF1: 'POP AF',
        0x16: `LD D,0x${b1.toString(16)}`,
        0xFD: 'IY prefix',
        0x5E: 'LD E,(HL)',
        0x21: `LD HL,0x${(b1|(b2<<8)).toString(16)}`,
        0xCD: `CALL 0x${(b1|(b2<<8)).toString(16)}`,
        0xFE: `CP 0x${b1.toString(16)}`,
        0x18: `JR 0x${(pc+2+((b1>127)?b1-256:b1)).toString(16)}`,
        0x30: `JR NC,0x${(pc+2+((b1>127)?b1-256:b1)).toString(16)}`,
        0x38: `JR C,0x${(pc+2+((b1>127)?b1-256:b1)).toString(16)}`,
        0x28: `JR Z,0x${(pc+2+((b1>127)?b1-256:b1)).toString(16)}`,
        0x20: `JR NZ,0x${(pc+2+((b1>127)?b1-256:b1)).toString(16)}`,
        0xE5: 'PUSH HL',
        0x06: `LD B,0x${b1.toString(16)}`,
        0x0E: `LD C,0x${b1.toString(16)}`,
        0x79: 'LD A,C',
        0xCB: 'CB prefix (bit ops)',
        0xC9: 'RET',
        0xD8: 'RET C',
        0xD0: 'RET NC',
        0xC0: 'RET NZ',
        0xC8: 'RET Z',
        0xBE: 'CP (HL)',
        0x23: 'INC HL',
        0x2B: 'DEC HL',
        0x77: 'LD (HL),A',
        0x7E: 'LD A,(HL)',
        0xC3: `JP 0x${(b1|(b2<<8)).toString(16)}`,
        0xCA: `JP Z,0x${(b1|(b2<<8)).toString(16)}`,
        0xC2: `JP NZ,0x${(b1|(b2<<8)).toString(16)}`,
        0xDA: `JP C,0x${(b1|(b2<<8)).toString(16)}`,
        0xD2: `JP NC,0x${(b1|(b2<<8)).toString(16)}`,
    };
    return ops[op] || `0x${op.toString(16)}`;
};

console.log('\nStep-by-step from 0x0F3B (100 steps):');
for (let i = 0; i < 100; i++) {
    const pc = cpu.PC;
    const flagC = (cpu.F & 1) ? 'C' : '';
    const flagZ = (cpu.F & 0x40) ? 'Z' : '';
    const flagS = (cpu.F & 0x80) ? 'S' : '';
    const flags = flagC + flagZ + flagS;
    const hl = (cpu.H << 8) | cpu.L;
    
    console.log(`${i}: PC=0x${pc.toString(16).padStart(4,'0')} A=0x${cpu.A.toString(16).padStart(2,'0')} HL=0x${hl.toString(16).padStart(4,'0')} [${flags||'-'}] ${disasm(pc)}`);
    
    cpu.step();
}

console.log(`\nFinal PC: 0x${cpu.PC.toString(16)}`);
