/**
 * Continue boot after RAM test completes
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

// Run until RAM test completes (about 200000 instructions)
console.log('Running RAM test... (this takes ~200000 instructions)');
let count = 0;
while (count < 200000) {
  cpu.step();
  count++;
}
console.log(`After ${count} instructions:`);
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  HL: 0x${((cpu.H << 8) | cpu.L).toString(16).padStart(4, '0')}`);

// Now trace the next 500 instructions in detail
console.log('\nTracing post-RAM-test boot:');
const maxTrace = 500;
let traced = 0;

// Track important events
const RAMTOP_ADDR = 0x5CB2;
const ERR_SP_ADDR = 0x5C3D;

while (traced < maxTrace) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  const sp = cpu.SP;
  const hl = (cpu.H << 8) | cpu.L;
  const bc = (cpu.B << 8) | cpu.C;
  const de = (cpu.D << 8) | cpu.E;
  
  // Show opcode and important state
  let extra = '';
  
  // Decode some important opcodes
  if (opcode === 0x31) { // LD SP,nn
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    extra = ` [LD SP, 0x${nn.toString(16).padStart(4, '0')}]`;
  } else if (opcode === 0xED) {
    const ed = memory.read(pc + 1);
    if (ed === 0x7B) { // LD SP,(nn)
      const nn = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      const val = memory.read(nn) | (memory.read(nn + 1) << 8);
      extra = ` [LD SP,(0x${nn.toString(16)})] = 0x${val.toString(16).padStart(4, '0')}`;
    } else if (ed === 0x43) { // LD (nn),BC
      const nn = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      extra = ` [LD (0x${nn.toString(16).padStart(4, '0')}),BC] BC=0x${bc.toString(16).padStart(4, '0')}`;
    } else if (ed === 0x53) { // LD (nn),DE
      const nn = memory.read(pc + 2) | (memory.read(pc + 3) << 8);
      extra = ` [LD (0x${nn.toString(16).padStart(4, '0')}),DE] DE=0x${de.toString(16).padStart(4, '0')}`;
    }
  } else if (opcode === 0x22) { // LD (nn),HL
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    extra = ` [LD (0x${nn.toString(16).padStart(4, '0')}),HL] HL=0x${hl.toString(16).padStart(4, '0')}`;
  } else if (opcode === 0xCD) { // CALL nn
    const nn = memory.read(pc + 1) | (memory.read(pc + 2) << 8);
    extra = ` [CALL 0x${nn.toString(16).padStart(4, '0')}]`;
  } else if (opcode === 0xCF) { // RST 08
    extra = ' [RST 08 - ERROR!]';
    console.log(`[${traced}] PC=0x${pc.toString(16).padStart(4,'0')} Op=0x${opcode.toString(16).padStart(2,'0')} SP=0x${sp.toString(16).padStart(4,'0')}${extra}`);
    console.log('\n*** ERROR HANDLER HIT! ***');
    break;
  } else if (opcode === 0xFB) { // EI
    extra = ' [EI - Interrupts enabled!]';
  }
  
  // Log instruction
  if (traced < 100 || extra || pc === 0x1234) {
    console.log(`[${traced}] PC=0x${pc.toString(16).padStart(4,'0')} Op=0x${opcode.toString(16).padStart(2,'0')} SP=0x${sp.toString(16).padStart(4,'0')} HL=0x${hl.toString(16).padStart(4,'0')}${extra}`);
  }
  
  cpu.step();
  traced++;
}

// Final state
console.log('\nFinal state:');
console.log(`  Total instructions: ${count + traced}`);
console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
console.log(`  IFF1: ${cpu.IFF1}`);

// Read system variables
const ramtop = memory.read(RAMTOP_ADDR) | (memory.read(RAMTOP_ADDR + 1) << 8);
const errSp = memory.read(ERR_SP_ADDR) | (memory.read(ERR_SP_ADDR + 1) << 8);
console.log(`  RAMTOP (0x5CB2): 0x${ramtop.toString(16).padStart(4, '0')}`);
console.log(`  ERR_SP (0x5C3D): 0x${errSp.toString(16).padStart(4, '0')}`);
