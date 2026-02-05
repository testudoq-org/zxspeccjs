/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

/**
 * Test LD HL,(nn) instruction - does it work?
 */

import { Z80 } from '../../src/z80.mjs';

console.log('='.repeat(60));
console.log('TEST LD HL,(nn) INSTRUCTION');
console.log('='.repeat(60));

const memory = new Uint8Array(65536);

// Put test value at address 0x5C84 (DF_CC)
memory[0x5C84] = 0x00;  // Low byte
memory[0x5C85] = 0x50;  // High byte - should give HL = 0x5000

// Program: LD HL,(0x5C84)
// Opcode: 2A 84 5C
memory[0x0000] = 0x2A;  // LD HL,(nn)
memory[0x0001] = 0x84;  // low byte of address
memory[0x0002] = 0x5C;  // high byte of address
memory[0x0003] = 0x76;  // HALT

const memoryInterface = {
  read: (addr) => memory[addr & 0xFFFF],
  write: (addr, val) => { memory[addr & 0xFFFF] = val; }
};

const ioInterface = {
  read: () => 0xFF,
  write: () => {}
};

const cpu = new Z80(memoryInterface, ioInterface);
cpu.reset();

console.log(`\nBefore execution:`);
console.log(`  PC = 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  HL = 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
console.log(`  Memory[0x5C84] = 0x${memory[0x5C84].toString(16).padStart(2, '0')}`);
console.log(`  Memory[0x5C85] = 0x${memory[0x5C85].toString(16).padStart(2, '0')}`);
console.log(`  Expected HL = 0x5000`);

// Execute LD HL,(nn)
const tstates = cpu.step();

console.log(`\nAfter execution:`);
console.log(`  Tstates: ${tstates} (expected: 16)`);
console.log(`  PC = 0x${cpu.PC.toString(16).padStart(4, '0')} (expected: 0x0003)`);
console.log(`  H = 0x${cpu.H.toString(16).padStart(2, '0')}`);
console.log(`  L = 0x${cpu.L.toString(16).padStart(2, '0')}`);
console.log(`  HL = 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')} (expected: 0x5000)`);

if ((cpu.H << 8 | cpu.L) === 0x5000) {
  console.log('\n✅ LD HL,(nn) works correctly!');
} else {
  console.log('\n❌ LD HL,(nn) is BROKEN!');
}

test('ld hl nn smoke', () => { expect(((cpu.H<<8)|cpu.L) === 0x5000).toBeTruthy(); });

