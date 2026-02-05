// Deep dive into boot sequence - trace execution flow after memory init
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const memory = new Memory();
const cpu = new Z80(memory);

memory.loadROM(rom.bytes);
cpu.reset();

// Track which addresses we visit in the 0x1200-0x1300 range
const visited1200 = new Set();

// Run for 5 million instructions
console.log('=== Tracing boot sequence ===');
const MAX = 5000000;

for (let i = 0; i < MAX; i++) {
  const pc = cpu.PC;
  
  // Track visits to 0x1200-0x1300 range
  if (pc >= 0x1200 && pc < 0x1300) {
    if (!visited1200.has(pc)) {
      visited1200.add(pc);
      const opcode = memory.read(pc);
      console.log(`NEW: PC=0x${pc.toString(16).padStart(4,'0')} op=0x${opcode.toString(16).padStart(2,'0')} at instruction ${i}`);
      
      // Check for EI
      if (opcode === 0xFB) {
        console.log(`*** EI instruction at 0x${pc.toString(16)}! ***`);
      }
    }
  }
  
  // Check for EI anywhere
  const opcode = memory.read(pc);
  if (opcode === 0xFB) {
    console.log(`\n*** EI executed at PC=0x${pc.toString(16).padStart(4,'0')}, instruction ${i} ***`);
    console.log(`Before: IFF1=${cpu.IFF1}`);
    cpu.step();
    console.log(`After: IFF1=${cpu.IFF1}`);
    if (cpu.IFF1) {
      console.log('SUCCESS!');
      break;
    }
    continue;
  }
  
  cpu.step();
}

console.log('\n=== Addresses visited in 0x1200-0x12FF range ===');
const sortedVisited = Array.from(visited1200).sort((a, b) => a - b);
console.log(sortedVisited.map(a => '0x' + a.toString(16).padStart(4, '0')).join(', '));

// Check if we visited the EI addresses
console.log('\n=== Did we reach EI locations? ===');
console.log(`0x1234: ${visited1200.has(0x1234) ? 'YES' : 'NO'}`);
console.log(`0x12D6: ${visited1200.has(0x12D6) ? 'YES' : 'NO'}`);

// Check ROM around 0x1234
console.log('\n=== ROM context around 0x1234 ===');
for (let i = 0x1230; i < 0x1240; i++) {
  const b = rom.bytes[i];
  let note = '';
  if (i === 0x1234) note = ' <-- EI here';
  if (b === 0xFB) note += ' (EI)';
  console.log(`0x${i.toString(16)}: 0x${b.toString(16).padStart(2,'0')}${note}`);
}
