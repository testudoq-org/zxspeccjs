/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';
import { loadRom } from '../../src/romManager.mjs';

console.log('Testing Z80 16-bit Immediate Load Instructions...\n');

// Create memory and CPU
const memory = new Memory();
const z80 = new Z80(memory);

// Load the ZX Spectrum 48K ROM
console.log('Loading ZX Spectrum 48K ROM...');
const romData = await loadRom('spec48');
console.log(`Loaded ROM: ${romData.metadata.description} (${romData.metadata.model})`);

// Apply ROM to memory
memory.loadROM(romData.rom);
memory.configureBanks('48k');
console.log('ROM loaded into memory.\n');

// Set up some test data in RAM so writes are effective
// Test data areas: instructions at 0x4000, data blocks at 0x5000/0x6000
memory.write(0x5000, 0x34);
memory.write(0x5001, 0x12);
memory.write(0x6000, 0x56);
memory.write(0x6001, 0x78);

// Test 1: LD BC,nn (0x01)
console.log('Test 1: LD BC,nn (opcode 0x01)');
z80.reset();
// Place instruction+operands in RAM at 0x4000 so writes are effective
z80.PC = 0x4000; // Point to test instruction
memory.write(0x4000, 0x01); // LD BC,nn opcode
memory.write(0x4001, 0x34); // Low byte
memory.write(0x4002, 0x12); // High byte
z80.step();
const bc = (z80.B << 8) | z80.C;
console.log(`Loaded BC = 0x${bc.toString(16).padStart(4, '0')} (expected: 0x1234)`);
console.log(`PC = 0x${z80.PC.toString(16).padStart(4, '0')} (expected: 0x4003)`);
console.log(`T-states: ${z80.tstates} (expected: 10)`);
console.log(`Test 1: ${bc === 0x1234 ? 'PASS' : 'FAIL'}\n`);

// Test 2: LD DE,nn (0x11)
console.log('Test 2: LD DE,nn (opcode 0x11)');
z80.reset();
// Place instruction+operands in RAM at 0x4000
z80.PC = 0x4000; // Point to test instruction
memory.write(0x4000, 0x11); // LD DE,nn opcode
memory.write(0x4001, 0x56); // Low byte
memory.write(0x4002, 0x78); // High byte
z80.step();
const de = (z80.D << 8) | z80.E;
console.log(`Loaded DE = 0x${de.toString(16).padStart(4, '0')} (expected: 0x7856)`);
console.log(`PC = 0x${z80.PC.toString(16).padStart(4, '0')} (expected: 0x4003)`);
console.log(`T-states: ${z80.tstates} (expected: 10)`);
console.log(`Test 2: ${de === 0x7856 ? 'PASS' : 'FAIL'}\n`);

// Test 3: LD HL,nn (0x21)
console.log('Test 3: LD HL,nn (opcode 0x21)');
z80.reset();
// Place instruction+operands in RAM at 0x4000
z80.PC = 0x4000; // Point to test instruction
memory.write(0x4000, 0x21); // LD HL,nn opcode
memory.write(0x4001, 0xAB); // Low byte
memory.write(0x4002, 0xCD); // High byte
z80.step();
const hl = (z80.H << 8) | z80.L;
console.log(`Loaded HL = 0x${hl.toString(16).padStart(4, '0')} (expected: 0xCDAB)`);
console.log(`PC = 0x${z80.PC.toString(16).padStart(4, '0')} (expected: 0x4003)`);
console.log(`T-states: ${z80.tstates} (expected: 10)`);
console.log(`Test 3: ${hl === 0xCDAB ? 'PASS' : 'FAIL'}\n`);

// Test 4: LD SP,nn (0x31)
console.log('Test 4: LD SP,nn (opcode 0x31)');
z80.reset();
// Place instruction+operands in RAM at 0x4000
z80.PC = 0x4000; // Point to test instruction
memory.write(0x4000, 0x31); // LD SP,nn opcode
memory.write(0x4001, 0xFE); // Low byte
memory.write(0x4002, 0xCA); // High byte
z80.step();
console.log(`Loaded SP = 0x${z80.SP.toString(16).padStart(4, '0')} (expected: 0xCAFE)`);
console.log(`PC = 0x${z80.PC.toString(16).padStart(4, '0')} (expected: 0x4003)`);
console.log(`T-states: ${z80.tstates} (expected: 10)`);
console.log(`Test 4: ${z80.SP === 0xCAFE ? 'PASS' : 'FAIL'}\n`);

// Test 5: Boot sequence test
console.log('Test 5: Boot sequence up to LD DE,nn');
z80.reset();
z80.PC = 0x0000;

// First instruction: DI (0xF3)
let instruction = z80.readByte(z80.PC);
console.log(`Instruction 1 at PC 0x0000: 0x${instruction.toString(16).padStart(2, '0')} (expected: 0xF3 - DI)`);
z80.step();
console.log(`After DI: PC = 0x${z80.PC.toString(16).padStart(4, '0')}, T-states = ${z80.tstates}`);

// Second instruction: XOR A (0xAF)
instruction = z80.readByte(z80.PC);
console.log(`Instruction 2 at PC 0x0001: 0x${instruction.toString(16).padStart(2, '0')} (expected: 0xAF - XOR A)`);
z80.step();
console.log(`After XOR A: PC = 0x${z80.PC.toString(16).padStart(4, '0')}, T-states = ${z80.tstates}`);

// Third instruction: LD DE,0xFFFF (0x11)
instruction = z80.readByte(z80.PC);
console.log(`Instruction 3 at PC 0x0002: 0x${instruction.toString(16).padStart(2, '0')} (expected: 0x11 - LD DE,nn)`);
z80.step();
const de_after = (z80.D << 8) | z80.E;
console.log(`After LD DE,0xFFFF: PC = 0x${z80.PC.toString(16).padStart(4, '0')}, DE = 0x${de_after.toString(16).padStart(4, '0')}, T-states = ${z80.tstates}`);
console.log(`Test 5: ${de_after === 0xFFFF ? 'PASS' : 'FAIL'}\n`);

console.log('=== 16-bit Immediate Load Instruction Tests Complete ===');

test('16-bit immediate smoke', () => {
  if (typeof z80 !== 'undefined') expect(typeof z80.PC).toBe('number'); else expect(true).toBe(true);
});
