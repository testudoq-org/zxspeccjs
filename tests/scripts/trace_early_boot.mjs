/**
 * Trace early boot to understand why RAM test loop doesn't exit
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

// Run until we reach the RAM test loop
let count = 0;
const maxCount = 100;

console.log('Tracing first 100 instructions:\n');

while (count < maxCount) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  const a = cpu.A;
  const h = cpu.H;
  const l = cpu.L;
  const d = cpu.D;
  const e = cpu.E;
  const hl = (h << 8) | l;
  const de = (d << 8) | e;
  
  console.log(`[${count.toString().padStart(3)}] PC=0x${pc.toString(16).padStart(4,'0')} Op=0x${opcode.toString(16).padStart(2,'0')} A=0x${a.toString(16).padStart(2,'0')} HL=0x${hl.toString(16).padStart(4,'0')} DE=0x${de.toString(16).padStart(4,'0')}`);
  
  cpu.step();
  count++;
}

console.log(`\nAfter ${count} instructions:`);
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  A: 0x${cpu.A.toString(16).padStart(2, '0')}`);
console.log(`  H: 0x${cpu.H.toString(16).padStart(2, '0')}`);
console.log(`  HL: 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
console.log(`  DE: 0x${((cpu.D << 8) | cpu.E).toString(16).padStart(4, '0')}`);
