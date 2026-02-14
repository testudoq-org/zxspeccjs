import fs from 'fs';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

const mem = new Memory({ model: '48k' });
const cpu = new Z80(mem);
mem.attachCPU(cpu);

// Program at 0x4000: LD HL,0x4000; LD A,0xAA; LD B,0x02; loop: LD (HL),A; INC HL; OUT (0xFE),A; DJNZ loop; HALT
const prog = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x02, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0x76];
for (let i = 0; i < prog.length; i++) mem.pages[1][i] = prog[i];

cpu.PC = 0x4000;
mem._memWrites = [];
cpu._microTraceEnabled = true;
cpu._microLog = [];

console.log('Starting simple loop test...');
for (let step = 0; step < 50; step++) {
  const cycles = cpu.step();
  const pc = cpu.PC;
  const hl = cpu._getHL();
  const b = cpu.B;
  console.log(`step=${step} pc=0x${pc.toString(16)} hl=0x${hl.toString(16)} B=${b} t=${cpu.tstates} cycles=${cycles}`);
  if (mem._memWrites.length > 0) console.log('  memWrites now:', mem._memWrites.map(w=>({addr: '0x'+w.addr.toString(16), v: w.value, t: w.t})));
  if (cpu.halted) { console.log('CPU halted at step', step, 'tstates=', cpu.tstates); break; }
}

const out = { tstates: cpu.tstates, micro: cpu._microLog, memWrites: mem._memWrites };
fs.writeFileSync('traces/run_loop_simple.json', JSON.stringify(out, null, 2));
console.log('Wrote traces/run_loop_simple.json');