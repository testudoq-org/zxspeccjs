/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

/**
 * Test CALL instruction directly
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

// Write a test program in RAM at 0x8000
// 0x8000: CD 10 80   CALL 0x8010
// 0x8003: 00         NOP (return here)
// 0x8010: C9         RET

memory.write(0x8000, 0xCD);  // CALL
memory.write(0x8001, 0x10);  // low byte of 0x8010
memory.write(0x8002, 0x80);  // high byte of 0x8010
memory.write(0x8003, 0x00);  // NOP (we should return here)
memory.write(0x8010, 0xC9);  // RET

cpu.PC = 0x8000;
cpu.SP = 0x8050;  // Stack in RAM

console.log('=== Testing CALL and RET ===');
console.log(`Before CALL: PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}`);

// Show memory before
console.log(`Memory at stack (0x804E-0x8050): ${memory.read(0x804E).toString(16)} ${memory.read(0x804F).toString(16)} ${memory.read(0x8050).toString(16)}`);

// Execute CALL
cpu.step();

console.log(`After CALL: PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}`);
console.log(`Stack content at SP (0x${cpu.SP.toString(16)}): ${memory.read(cpu.SP).toString(16)} ${memory.read(cpu.SP + 1).toString(16)}`);

const stackVal = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
console.log(`Return address on stack: 0x${stackVal.toString(16)} (should be 0x8003)`);

// Execute RET
cpu.step();

console.log(`After RET: PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}`);
console.log(`PC should be 0x8003`);

if (cpu.PC === 0x8003) {
    console.log('✓ CALL/RET working correctly in RAM');
} else {
    console.log('✗ CALL/RET NOT working correctly');
}

// Now test with the actual ROM scenario
console.log('\n=== Testing ROM scenario ===');

// Simulate being at 0x02BF about to call 0x028E
// The issue is when we write to the stack which is in RAM at around 0x3F46

cpu.PC = 0x02BF;
cpu.SP = 0x3F48;

// First check what's at 0x02BF in ROM
console.log(`ROM at 0x02BF: ${memory.read(0x02BF).toString(16)} ${memory.read(0x02C0).toString(16)} ${memory.read(0x02C1).toString(16)}`);
// Should be CD 8E 02 (CALL 0x028E)

console.log(`\nBefore CALL 0x028E:`);
console.log(`  PC=0x${cpu.PC.toString(16)}, SP=0x${cpu.SP.toString(16)}`);
console.log(`  Stack content at 0x3F46: ${memory.read(0x3F46).toString(16)} ${memory.read(0x3F47).toString(16)}`);

// Execute CALL
cpu.step();

console.log(`\nAfter CALL:`);
console.log(`  PC=0x${cpu.PC.toString(16)} (should be 0x028E)`);
console.log(`  SP=0x${cpu.SP.toString(16)} (should be 0x3F46)`);
console.log(`  Stack content at SP: ${memory.read(cpu.SP).toString(16)} ${memory.read(cpu.SP + 1).toString(16)}`);

const romStackVal = memory.read(cpu.SP) | (memory.read(cpu.SP + 1) << 8);
console.log(`  Return address: 0x${romStackVal.toString(16)} (should be 0x02C2)`);

if (romStackVal === 0x02C2) {
    console.log('✓ CALL pushed correct return address');
} else {
    console.log('✗ CALL pushed WRONG return address!');
    
    // Debug - check if the memory write actually happened
    console.log('\nDebug info:');
    console.log(`  Trying to read from 0x3F46 directly...`);
    console.log(`  memory.read(0x3F46) = ${memory.read(0x3F46).toString(16)}`);
    console.log(`  memory.read(0x3F47) = ${memory.read(0x3F47).toString(16)}`);
    
    // Check if this is in ROM area vs RAM area
    console.log(`\n  Address 0x3F46 is in page ${Math.floor(0x3F46 / 0x4000)}`);
    console.log(`  This should be RAM page 0 (0x4000-0x7FFF is display, 0x0000-0x3FFF is ROM)`);
    console.log(`  Wait - 0x3F46 < 0x4000 so it's in ROM page!`);
    console.log(`  The ROM is read-only, so writes to 0x3F46 are being ignored!`);
}

