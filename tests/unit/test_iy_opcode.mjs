/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

// Test LD IY,nn opcode
import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';

// Create memory with LD IY,0x5C3A instruction at address 0
const memory = new Memory({ model: '48k' });
memory.write(0x4000, 0xFD); // FD prefix
memory.write(0x4001, 0x21); // LD IY,nn
memory.write(0x4002, 0x3A); // low byte
memory.write(0x4003, 0x5C); // high byte

const cpu = new Z80(memory);
cpu.io = { read: () => 0xFF, write: () => {} };
cpu.PC = 0x4000;

console.log('Before: IY=0x' + cpu.IY.toString(16) + ', PC=0x' + cpu.PC.toString(16));
const consumed = cpu.step();
console.log('After:  IY=0x' + cpu.IY.toString(16) + ', PC=0x' + cpu.PC.toString(16) + ', consumed=' + consumed);
console.log('Expected: IY=0x5c3a, PC=0x4004');

test('iy opcode smoke', () => { expect(cpu.IY === 0x5C3A).toBeTruthy(); });

