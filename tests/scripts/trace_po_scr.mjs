/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Detailed trace of PO-SCR (0x0B03) to see why HL ends up 0
 */

import fs from 'fs';
import { Z80 } from './src/z80.mjs';

console.log('='.repeat(70));
console.log('DETAILED TRACE OF PO-SCR (0x0B03)');
console.log('='.repeat(70));

// Load ROM
const romData = fs.readFileSync('./roms/spec48.rom');
const memory = new Uint8Array(65536);
memory.set(romData, 0);

// Initialize key system variables
memory[0x5C84] = 0x00;
memory[0x5C85] = 0x50;  // DF_CC = 0x5000

memory[0x5C88] = 21;    // S_POSN col
memory[0x5C89] = 23;    // S_POSN line

memory[0x5C91] = 0x00;  // P_FLAG

const memoryInterface = {
  read: (addr) => memory[addr & 0xFFFF],
  write: (addr, val) => {
    if (addr >= 0x4000) memory[addr & 0xFFFF] = val;
  }
};

const ioInterface = {
  read: (port) => 0xFF,
  write: (port, val) => {}
};

const cpu = new Z80(memoryInterface, ioInterface);
cpu.reset();

// Set IY which is used by FD-prefixed instructions
cpu.IY = 0x5C3A;
cpu.SP = 0xFF00;
cpu.PC = 0x0B03;  // PO-SCR

// Simple disassembly names
const names = {
  0x2A: 'LD HL,(nn)',
  0xED: 'ED prefix',
  0xFD: 'FD prefix',
  0xC8: 'RET Z',
  0xC9: 'RET',
  0x28: 'JR Z,d',
  0x20: 'JR NZ,d',
};

console.log('\nInitial state:');
console.log(`  PC = 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  IY = 0x${cpu.IY.toString(16).padStart(4, '0')}`);
console.log(`  DF_CC (0x5C84-5C85) = 0x${(memory[0x5C84] | (memory[0x5C85] << 8)).toString(16).padStart(4, '0')}`);
console.log(`  S_POSN (0x5C88-5C89) = col=${memory[0x5C88]}, line=${memory[0x5C89]}`);

console.log('\n--- Instruction trace ---');

for (let i = 0; i < 30; i++) {
  const pc = cpu.PC;
  const op = memory[pc];
  const op2 = memory[pc + 1];
  const op3 = memory[pc + 2];
  const op4 = memory[pc + 3];
  
  const hl = (cpu.H << 8) | cpu.L;
  const bc = (cpu.B << 8) | cpu.C;
  const de = (cpu.D << 8) | cpu.E;
  const f = cpu.F;
  const zf = (f & 0x40) ? 'Z' : 'z';
  const cf = (f & 0x01) ? 'C' : 'c';
  
  let info = `[${i.toString().padStart(2)}] 0x${pc.toString(16).padStart(4, '0')}: `;
  info += `${op.toString(16).padStart(2, '0')} ${op2.toString(16).padStart(2, '0')} ${op3.toString(16).padStart(2, '0')} ${op4.toString(16).padStart(2, '0')}`;
  info += ` | HL=${hl.toString(16).padStart(4, '0')} BC=${bc.toString(16).padStart(4, '0')} ${zf}${cf}`;
  
  // Special handling for FD prefix
  if (op === 0xFD && op2 === 0xCB) {
    const d = op3;
    const opFDCB = op4;
    const offset = d < 128 ? d : d - 256;
    const addr = cpu.IY + offset;
    const memVal = memory[addr & 0xFFFF];
    info += ` | FD CB BIT op @ (IY+${offset})=0x${addr.toString(16)} val=0x${memVal.toString(16).padStart(2, '0')}`;
    if (opFDCB === 0x4E) { // BIT 1,(IY+d)
      const bit1set = (memVal & 0x02) !== 0;
      info += ` BIT 1 -> ${bit1set ? 'set(NZ)' : 'clear(Z)'}`;
    }
    if (opFDCB === 0x46) { // BIT 0,(IY+d)
      const bit0set = (memVal & 0x01) !== 0;
      info += ` BIT 0 -> ${bit0set ? 'set(NZ)' : 'clear(Z)'}`;
    }
  }
  
  console.log(info);
  
  const consumed = cpu.step();
  
  // Stop at RET
  if (op === 0xC9 || op === 0xC8) {
    console.log('  (Return executed)');
    break;
  }
}

console.log('\n--- After PO-SCR ---');
console.log(`  HL = 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);
console.log(`  BC = 0x${((cpu.B << 8) | cpu.C).toString(16).padStart(4, '0')}`);

