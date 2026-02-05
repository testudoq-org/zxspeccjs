/**
 * Deep trace of attribute writes - capture ALL context
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

// Store instruction trace leading up to writes
let recentInstructions = [];
const MAX_TRACE = 100;
let attrWrites = [];

// Hook step to track instructions
const originalStep = cpu.step.bind(cpu);
cpu.step = function() {
  const pc = cpu.PC;
  const op = mem.read(pc);
  
  // Track recent instructions
  recentInstructions.push({
    pc,
    op,
    HL: cpu._getHL(),
    DE: cpu._getDE(),
    BC: cpu._getBC(),
    A: cpu.A,
    SP: cpu.SP
  });
  if (recentInstructions.length > MAX_TRACE) {
    recentInstructions.shift();
  }
  
  return originalStep();
};

// Hook memory write to catch attribute writes  
const originalWrite = mem.write.bind(mem);
mem.write = function(addr, val) {
  if (addr >= 0x5800 && addr < 0x5B00 && attrWrites.length < 10) {
    // Capture the instruction history
    attrWrites.push({
      addr,
      val,
      history: [...recentInstructions.slice(-20)]
    });
  }
  return originalWrite(addr, val);
};

console.log('Running until first attribute writes...\n');

let steps = 0;
while (attrWrites.length < 10 && steps < 5000000) {
  cpu.step();
  steps++;
  if (cpu.iff1 && steps % 69888 === 0) cpu.interrupt();
}

console.log(`=== First ${attrWrites.length} attribute writes ===\n`);

for (let w = 0; w < attrWrites.length; w++) {
  const write = attrWrites[w];
  console.log(`\nWrite #${w+1}: addr=0x${write.addr.toString(16)} val=0x${write.val.toString(16).padStart(2, '0')}`);
  console.log('Instruction trace leading up to write:');
  
  for (const inst of write.history.slice(-10)) {
    const op2 = mem.read(inst.pc + 1);
    const op3 = mem.read(inst.pc + 2);
    console.log(`  PC=0x${inst.pc.toString(16).padStart(4, '0')} op=${inst.op.toString(16).padStart(2, '0')} ${op2.toString(16).padStart(2, '0')} ${op3.toString(16).padStart(2, '0')} A=0x${inst.A.toString(16).padStart(2, '0')} HL=0x${inst.HL.toString(16).padStart(4, '0')} DE=0x${inst.DE.toString(16).padStart(4, '0')} BC=0x${inst.BC.toString(16).padStart(4, '0')} SP=0x${inst.SP.toString(16).padStart(4, '0')}`);
  }
}
