/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace the critical RAM detection section in detail
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Memory({ model: '48k' });
memory.loadROM(romData);
const cpu = new Z80(memory);
memory.attachCPU(cpu);
cpu.reset();

// Run until just before the loop exits (at PC=0x11e2)
console.log('Running until RAM test loop exits...');
let count = 0;
while (count < 250000 && cpu.PC !== 0x11E2) {
  cpu.step();
  count++;
}

console.log(`\nAt RAM detection code (after ${count} instructions):`);
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  HL: 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
console.log(`  DE: 0x${((cpu.D << 8) | cpu.E).toString(16).padStart(4, '0')}`);
console.log(`  Flags: C=${cpu.F & 1}, Z=${(cpu.F >> 6) & 1}, N=${(cpu.F >> 1) & 1}`);

// Now trace each instruction carefully
console.log('\nDetailed trace of RAM detection:');

const traceInstructions = 50;
for (let i = 0; i < traceInstructions; i++) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  const hl = (cpu.H << 8) | cpu.L;
  const de = (cpu.D << 8) | cpu.E;
  const bc = (cpu.B << 8) | cpu.C;
  const sp = cpu.SP;
  const flags = cpu.F;
  const carry = flags & 1;
  const zero = (flags >> 6) & 1;
  
  // Decode instruction
  let instr = '';
  let nextBytes = '';
  if (opcode === 0xA7) instr = 'AND A';
  else if (opcode === 0xED) {
    const ed = memory.read(pc + 1);
    nextBytes = ed.toString(16).padStart(2, '0');
    if (ed === 0x52) instr = 'SBC HL,DE';
    else if (ed === 0x43) {
      const nn = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      instr = `LD (0x${nn.toString(16).padStart(4, '0')}),BC`;
    } else if (ed === 0x53) {
      const nn = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      instr = `LD (0x${nn.toString(16).padStart(4, '0')}),DE`;
    } else instr = `ED ${ed.toString(16)}`;
  } else if (opcode === 0x19) instr = 'ADD HL,DE';
  else if (opcode === 0x23) instr = 'INC HL';
  else if (opcode === 0x2B) instr = 'DEC HL';
  else if (opcode === 0x30) {
    const e = memory.read(pc + 1);
    const target = pc + 2 + (e > 127 ? e - 256 : e);
    instr = `JR NC,0x${target.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0x28) {
    const e = memory.read(pc + 1);
    const target = pc + 2 + (e > 127 ? e - 256 : e);
    instr = `JR Z,0x${target.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0x35) instr = 'DEC (HL)';
  else if (opcode === 0xD9) instr = 'EXX';
  else if (opcode === 0x22) {
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    instr = `LD (0x${nn.toString(16).padStart(4, '0')}),HL`;
  } else if (opcode === 0x04) instr = 'INC B';
  else if (opcode === 0xF3) instr = 'DI';
  else if (opcode === 0x21) {
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    instr = `LD HL,0x${nn.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0x11) {
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    instr = `LD DE,0x${nn.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0x01) {
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    instr = `LD BC,0x${nn.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0xEB) instr = 'EX DE,HL';
  else instr = `??? 0x${opcode.toString(16)}`;
  
  console.log(`[${i}] PC=0x${pc.toString(16).padStart(4,'0')} ${instr.padEnd(25)} HL=0x${hl.toString(16).padStart(4,'0')} DE=0x${de.toString(16).padStart(4,'0')} BC=0x${bc.toString(16).padStart(4,'0')} C=${carry} Z=${zero}`);
  
  cpu.step();
}

// Show final state
console.log('\nAfter RAM detection:');
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  HL: 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
console.log(`  DE: 0x${((cpu.D << 8) | cpu.E).toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);

// Check system variables
const RAMTOP_ADDR = 0x5CB2;
const ramtop = memory.read(RAMTOP_ADDR) | (memory.read(RAMTOP_ADDR + 1) << 8);
console.log(`  RAMTOP (0x5CB2): 0x${ramtop.toString(16).padStart(4, '0')}`);

