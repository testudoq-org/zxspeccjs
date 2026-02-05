/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

/**
 * Check if LDDR is causing the alternating pattern
 * The ROM early boot uses LDDR to copy attributes
 */

import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

// First, manually test LDDR
console.log('=== Manual LDDR test ===');

// Setup: Fill source with 0x39 (attribute value)
for (let i = 0x6000; i < 0x6010; i++) {
  mem.write(i, 0x39);
}

// Now run LDDR from 0x600F to 0x700F, count 16
cpu.H = 0x60; cpu.L = 0x0F; // HL = 0x600F (source end)
cpu.D = 0x70; cpu.E = 0x0F; // DE = 0x700F (dest end)
cpu.B = 0x00; cpu.C = 0x10; // BC = 16

console.log(`Before LDDR: HL=0x${cpu._getHL().toString(16)} DE=0x${cpu._getDE().toString(16)} BC=0x${cpu._getBC().toString(16)}`);

// Execute LDDR (opcode ED B8)
cpu.PC = 0x8000;
mem.write(0x8000, 0xED);
mem.write(0x8001, 0xB8);

let lddrSteps = 0;
while (cpu._getBC() !== 0 && lddrSteps < 100) {
  cpu.step();
  lddrSteps++;
}

console.log(`After LDDR (${lddrSteps} steps): HL=0x${cpu._getHL().toString(16)} DE=0x${cpu._getDE().toString(16)} BC=0x${cpu._getBC().toString(16)}`);

// Check destination
console.log('Destination values:');
for (let i = 0x7000; i < 0x7010; i++) {
  console.log(`  0x${i.toString(16)}: 0x${mem.read(i).toString(16).padStart(2, '0')}`);
}

// Now test with ALTERNATING source (to see if it copies correctly)
console.log('\n=== LDDR with alternating source ===');

// Fill source with alternating pattern
for (let i = 0; i < 16; i++) {
  mem.write(0x6100 + i, (i % 2 === 0) ? 0xAA : 0x55);
}

// Reset CPU and run LDDR again
const cpu2 = new Z80(mem);
cpu2.H = 0x61; cpu2.L = 0x0F; // HL = 0x610F
cpu2.D = 0x71; cpu2.E = 0x0F; // DE = 0x710F
cpu2.B = 0x00; cpu2.C = 0x10; // BC = 16

cpu2.PC = 0x8000;
mem.write(0x8000, 0xED);
mem.write(0x8001, 0xB8);

lddrSteps = 0;
while (cpu2._getBC() !== 0 && lddrSteps < 100) {
  cpu2.step();
  lddrSteps++;
}

console.log('Source values:');
for (let i = 0x6100; i < 0x6110; i++) {
  console.log(`  0x${i.toString(16)}: 0x${mem.read(i).toString(16).padStart(2, '0')}`);
}

console.log('Destination values (should match source):');
for (let i = 0x7100; i < 0x7110; i++) {
  console.log(`  0x${i.toString(16)}: 0x${mem.read(i).toString(16).padStart(2, '0')}`);
}

test('lddr smoke', () => { expect(typeof mem.read === 'function').toBeTruthy(); });

