/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Trace the actual instruction causing alternating attributes
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

// Hook writeByte to catch the attribute writes
const originalWriteByte = cpu.writeByte.bind(cpu);
let attrWriteLog = [];

cpu.writeByte = function(addr, val) {
  if (addr >= 0x5800 && addr < 0x5B00 && attrWriteLog.length < 20) {
    // Get the previous instruction's PC (current PC is after fetch)
    // Capture registers too
    attrWriteLog.push({
      addr,
      val,
      PC: cpu.PC,
      HL: cpu._getHL(),
      DE: cpu._getDE(),
      BC: cpu._getBC(),
      A: cpu.A
    });
  }
  return originalWriteByte(addr, val);
};

console.log('Running until first attribute writes...');

let steps = 0;
while (attrWriteLog.length < 20 && steps < 10000000) {
  cpu.step();
  steps++;
  if (cpu.iff1 && steps % 69888 === 0) cpu.interrupt();
}

console.log(`\nFirst 20 attribute writes (after ${steps} steps):`);
for (const w of attrWriteLog) {
  console.log(`  addr=0x${w.addr.toString(16)} val=0x${w.val.toString(16).padStart(2, '0')} PC=0x${w.PC.toString(16).padStart(4, '0')} HL=0x${w.HL.toString(16).padStart(4, '0')} DE=0x${w.DE.toString(16).padStart(4, '0')} BC=0x${w.BC.toString(16).padStart(4, '0')} A=0x${w.A.toString(16).padStart(2, '0')}`);
}

// Check the bytes around where this happens
console.log('\nROM bytes near PC after writes:');
for (let i = 0x30; i <= 0x45; i++) {
  const byte = romData[i];
  console.log(`  0x${i.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')}`);
}

