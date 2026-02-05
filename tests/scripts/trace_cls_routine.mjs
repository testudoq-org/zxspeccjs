/**
 * Trace step-by-step around the attribute writes
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

let foundFirstAttrWrite = false;
let traceSteps = 0;
let traceLog = [];

console.log('Running until we get near attribute writes...');

// Run until we're close to the first attribute write
let steps = 0;
while (!foundFirstAttrWrite && steps < 10000000) {
  const pcBefore = cpu.PC;
  const opcode = mem.read(pcBefore);
  
  cpu.step();
  steps++;
  
  // Check if this step wrote to attribute area
  // We can detect by checking if ATTR area changed
  if (pcBefore >= 0x0D80 && pcBefore <= 0x0DA0) {
    // We're in CLS area
    if (!foundFirstAttrWrite) {
      console.log(`\nEntered CLS routine at PC=0x${pcBefore.toString(16)}`);
      foundFirstAttrWrite = true;
      traceSteps = 50;
    }
  }
  
  if (foundFirstAttrWrite && traceSteps > 0) {
    traceLog.push({
      pc: pcBefore,
      opcode: opcode.toString(16).padStart(2, '0'),
      A: cpu.A,
      HL: cpu._getHL(),
      C: cpu.C,
      B: cpu.B
    });
    traceSteps--;
  }
  
  if (cpu.iff1 && steps % 69888 === 0) cpu.interrupt();
}

console.log(`\nTrace log (${traceLog.length} steps):`);
for (const t of traceLog) {
  const mnemonic = getMnemonic(t.opcode);
  console.log(`  PC=0x${t.pc.toString(16).padStart(4, '0')} op=0x${t.opcode} A=0x${t.A.toString(16).padStart(2, '0')} HL=0x${t.HL.toString(16).padStart(4, '0')} B=${t.B} C=${t.C} ; ${mnemonic}`);
}

// Simple mnemonic lookup for common ops
function getMnemonic(opcode) {
  const opcodes = {
    '21': 'LD HL,nn',
    '3a': 'LD A,(nn)',
    '05': 'DEC B',
    '18': 'JR d',
    '0e': 'LD C,n',
    '2b': 'DEC HL',
    '77': 'LD (HL),A',
    '0d': 'DEC C',
    '20': 'JR NZ,d',
    '10': 'DJNZ d',
    'c9': 'RET',
    'fd': 'IY prefix'
  };
  return opcodes[opcode] || '???';
}
