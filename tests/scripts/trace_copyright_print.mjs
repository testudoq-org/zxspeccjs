/**
 * Trace what's happening after interrupts are enabled
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

// Initialize system
const memory = new Memory({ model: '48k' });
memory.loadROM(ROM_DATA.bytes, 0);

// Create mock canvas
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

// Verify ROM
console.log('ROM loaded, first bytes:', memory.read(0).toString(16), memory.read(1).toString(16));

const TSTATES_PER_FRAME = 69888;

// Track key events
let eiExecuted = false;
let firstInterrupt = false;
let frameCount = 0;
let traceEnabled = false;
let traceLog = [];

// Run until we're past EI and have had some interrupts
console.log('\n=== Running to find copyright message location ===');

for (let frame = 0; frame < 300 && !traceEnabled; frame++) {
    let tstates = 0;
    while (tstates < TSTATES_PER_FRAME) {
        const pc = cpu.PC;
        const consumed = cpu.step();
        tstates += consumed;
        
        // Check for EI
        if (!eiExecuted && cpu.IFF1) {
            eiExecuted = true;
            console.log(`Frame ${frame}: EI executed, IFF1 now true at PC=0x${pc.toString(16)}`);
        }
        
        // Check for RST 10h (PRINT_A routine)
        // 0x0010 is the RST 10h entry point - character print routine
        if (pc === 0x0010) {
            const charToPrint = cpu.A;
            if (charToPrint >= 32 && charToPrint <= 127) {
                traceLog.push({frame, char: charToPrint === 127 ? '©' : String.fromCharCode(charToPrint), code: charToPrint});
            } else {
                traceLog.push({frame, char: `[${charToPrint.toString(16)}]`, code: charToPrint});
            }
        }
    }
    
    // Generate interrupt at end of frame
    if (cpu.IFF1) {
        cpu.requestInterrupt();
        if (!firstInterrupt) {
            firstInterrupt = true;
            console.log(`Frame ${frame}: First interrupt generated`);
        }
    }
    
    frameCount = frame;
}

console.log(`\nRan ${frameCount + 1} frames`);
console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
console.log(`IFF1: ${cpu.IFF1}`);

// Show what characters were printed
console.log('\n=== Characters printed via RST 10h ===');
if (traceLog.length > 0) {
    console.log(`Total characters: ${traceLog.length}`);
    console.log('First 50:', traceLog.slice(0, 50).map(t => t.char).join(''));
} else {
    console.log('No characters printed via RST 10h');
}

// Check where copyright message is in ROM
console.log('\n=== Copyright message location in ROM ===');
const searchStr = '1982';
for (let addr = 0; addr < 16384 - 20; addr++) {
    let match = true;
    for (let i = 0; i < searchStr.length; i++) {
        if (memory.read(addr + i) !== searchStr.charCodeAt(i)) {
            match = false;
            break;
        }
    }
    if (match) {
        console.log(`Found "${searchStr}" at ROM address 0x${addr.toString(16)}`);
        // Show full message
        let str = '';
        for (let i = -3; i < 30; i++) {
            const byte = memory.read(addr + i);
            if (byte >= 32 && byte < 127) {
                str += String.fromCharCode(byte);
            } else if (byte === 0x7f) {
                str += '©';
            } else {
                str += `[${byte.toString(16)}]`;
            }
        }
        console.log(`Context: "${str}"`);
        break;
    }
}

// Check RAMTOP
const ramtop = memory.read(0x5CB2) | (memory.read(0x5CB3) << 8);
console.log(`\nRAMTOP: 0x${ramtop.toString(16)}`);

// Check channel info
const chans = memory.read(0x5C4F) | (memory.read(0x5C50) << 8);
console.log(`CHANS: 0x${chans.toString(16)}`);

// Check what's at PC
console.log(`\nROM at current PC (0x${cpu.PC.toString(16)}):`);
for (let i = 0; i < 10; i++) {
    console.log(`  0x${(cpu.PC + i).toString(16)}: ${memory.read(cpu.PC + i).toString(16)}`);
}
