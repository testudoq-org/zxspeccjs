/**
 * Deep trace what happens during first ~500 frames after boot
 * Looking for why the copyright doesn't print
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

console.log('ROM loaded, first bytes:', memory.read(0).toString(16), memory.read(1).toString(16));

const TSTATES_PER_FRAME = 69888;

// Key ROM addresses to watch
const keyAddresses = {
    0x0000: 'RST 00 - Start',
    0x0008: 'RST 08 - Error handler',
    0x0010: 'RST 10 - Print character',
    0x0018: 'RST 18 - Get character',
    0x0020: 'RST 20 - Next character',
    0x0028: 'RST 28 - Calculator',
    0x0030: 'RST 30 - Floating point',
    0x0038: 'RST 38/IM1 - Interrupt',
    0x11CB: 'NEW routine',
    0x11DA: 'START routine',
    0x1234: 'EI instruction',
    0x12AC: 'MAIN routine entry',
    0x15E6: 'PO_MSG - Print message',
    0x16C8: 'MAIN-4 loop',
    0x1795: 'CLS command',
    0x1539: 'Copyright message',
};

let eiExecuted = false;
let events = [];
let lastInterruptFrame = -1;

console.log('\n=== Tracing boot with key address monitoring ===');

for (let frame = 0; frame < 100; frame++) {
    let tstates = 0;
    
    while (tstates < TSTATES_PER_FRAME) {
        const pc = cpu.PC;
        const opcode = memory.read(pc);
        
        // Check for key addresses
        if (keyAddresses[pc] && !events.some(e => e.addr === pc && e.frame === frame)) {
            events.push({
                frame,
                addr: pc,
                name: keyAddresses[pc],
                A: cpu.A,
                IFF1: cpu.IFF1
            });
        }
        
        // Check for EI execution
        if (!eiExecuted && pc === 0x1234) {
            console.log(`Frame ${frame}: About to execute EI at 0x1234`);
        }
        
        const consumed = cpu.step();
        tstates += consumed;
        
        if (!eiExecuted && cpu.IFF1) {
            eiExecuted = true;
            console.log(`Frame ${frame}: EI executed, IFF1=true`);
        }
        
        // Catch RST 08 (error) with error code
        if (pc === 0x0008 && !events.some(e => e.addr === pc && e.desc === 'ERROR')) {
            // The error code is pushed after the RST 08
            // Actually the error number is in the byte after the RST 08 call
            events.push({
                frame,
                addr: pc,
                name: 'ERROR called!',
                desc: 'ERROR',
                errByte: memory.read(cpu.SP) // Return address low byte
            });
        }
    }
    
    // Generate interrupt
    if (cpu.IFF1) {
        cpu.requestInterrupt();
        if (lastInterruptFrame !== frame) {
            lastInterruptFrame = frame;
        }
    }
}

console.log(`\n=== Key events during boot (first 100 frames) ===`);
for (const event of events.slice(0, 50)) {
    let msg = `Frame ${event.frame}: 0x${event.addr.toString(16).padStart(4, '0')} - ${event.name}`;
    if (event.A !== undefined) {
        msg += ` (A=${event.A.toString(16)}, IFF1=${event.IFF1})`;
    }
    if (event.errByte !== undefined) {
        msg += ` [errByte=${event.errByte.toString(16)}]`;
    }
    console.log(msg);
}

// Check system variables after boot
console.log('\n=== System variables after 100 frames ===');
const sysVars = {
    'ERR_NR': 0x5C3A,
    'FLAGS': 0x5C3B,
    'RAMTOP': 0x5CB2,
    'UDG': 0x5C7B,
    'CHARS': 0x5C36,
    'DF_CC': 0x5C84,
    'S_POSN_col': 0x5C88,
    'S_POSN_line': 0x5C89,
    'ATTR_P': 0x5C8D,
    'BORDCR': 0x5C48,
};

for (const [name, addr] of Object.entries(sysVars)) {
    if (name === 'RAMTOP' || name === 'CHARS' || name === 'UDG' || name === 'DF_CC') {
        const val = memory.read(addr) | (memory.read(addr + 1) << 8);
        console.log(`  ${name}: 0x${val.toString(16)}`);
    } else {
        const val = memory.read(addr);
        console.log(`  ${name}: 0x${val.toString(16)} (${val})`);
    }
}

// Check if display has any text
console.log('\n=== Scanning display for text ===');
let textFound = false;

// Look for non-02 content in display memory
for (let addr = 0x4000; addr < 0x5800; addr++) {
    const byte = memory.read(addr);
    if (byte !== 0x02 && byte !== 0x00) {
        if (!textFound) {
            console.log('Found non-fill content:');
            textFound = true;
        }
        console.log(`  0x${addr.toString(16)}: 0x${byte.toString(16)}`);
        if (addr > 0x4010) break; // Just show first few
    }
}

if (!textFound) {
    console.log('Display only contains 0x02 fill pattern - no text rendered');
}

// Check RAMTOP more carefully
console.log('\n=== Memory configuration ===');
const ramtopL = memory.read(0x5CB2);
const ramtopH = memory.read(0x5CB3);
console.log(`RAMTOP bytes: L=0x${ramtopL.toString(16)}, H=0x${ramtopH.toString(16)}`);
console.log(`RAMTOP = 0x${(ramtopL | (ramtopH << 8)).toString(16)}`);

// Check what's at RAMTOP
const ramtop = ramtopL | (ramtopH << 8);
console.log(`Memory at RAMTOP (0x${ramtop.toString(16)}): 0x${memory.read(ramtop).toString(16)}`);
