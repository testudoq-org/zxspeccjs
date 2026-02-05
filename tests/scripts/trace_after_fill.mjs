// Trace execution after the memory fill loop
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const memory = new Memory();
const cpu = new Z80(memory);

memory.loadROM(rom.bytes);
cpu.reset();

// Run through the fill loop (approx 49152 * 4 = ~200000 instructions)
console.log('=== Skipping memory fill loop ===');
let fillLoopCount = 0;
let inFillLoop = false;

while (fillLoopCount < 200000) {
  const pc = cpu.PC;
  
  if (pc === 0x11DC) inFillLoop = true;
  
  // Detect exit from fill loop
  if (inFillLoop && pc === 0x11E2) {
    console.log(`Exited fill loop after ${fillLoopCount} iterations`);
    const HL = (cpu.H << 8) | cpu.L;
    console.log(`HL=0x${HL.toString(16).padStart(4,'0')}, A=0x${cpu.A.toString(16).padStart(2,'0')}`);
    break;
  }
  
  cpu.step();
  fillLoopCount++;
}

// Now trace the next 500 instructions
console.log('\n=== Next 500 instructions after fill loop ===');
for (let i = 0; i < 500; i++) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  const op1 = memory.read(pc + 1);
  const op2 = memory.read(pc + 2);
  const HL = (cpu.H << 8) | cpu.L;
  const DE = (cpu.D << 8) | cpu.E;
  const BC = (cpu.B << 8) | cpu.C;
  
  // Check for important instructions
  let annotation = '';
  if (opcode === 0xFB) annotation = '*** EI ***';
  else if (opcode === 0xF3) annotation = '*** DI ***';
  else if (opcode === 0x76) annotation = '*** HALT ***';
  else if (opcode === 0xC3) annotation = `JP 0x${((op2 << 8) | op1).toString(16)}`;
  else if (opcode === 0xCD) annotation = `CALL 0x${((op2 << 8) | op1).toString(16)}`;
  else if (opcode === 0xC9) annotation = 'RET';
  
  if (i < 50 || annotation.includes('***') || (i % 100 === 0)) {
    console.log(`${i.toString().padStart(3)}: PC=0x${pc.toString(16).padStart(4,'0')} op=${opcode.toString(16).padStart(2,'0')} ${annotation} | HL=${HL.toString(16).padStart(4,'0')} IFF1=${cpu.IFF1}`);
  }
  
  cpu.step();
}

console.log('\n=== After 500 instructions ===');
console.log(`PC=0x${cpu.PC.toString(16).padStart(4,'0')}, IFF1=${cpu.IFF1}`);
