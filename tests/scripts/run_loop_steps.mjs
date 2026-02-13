#!/usr/bin/env node
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

(async function() {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);

  // Program in RAM at 0x4000: LD HL,0x4000; LD A,0xAA; LD B,0x02; loop: LD (HL),A; INC HL; OUT (0xFE),A; DJNZ loop; HALT
  const prog = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x02, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0x76];
  // write program into page1 (RAM mapped at 0x4000..)
  for (let i = 0; i < prog.length; i++) mem.pages[1][i] = prog[i];

  cpu.PC = 0x4000;
  mem._memWrites = [];
  cpu._microTraceEnabled = true;

  console.log('Starting step loop...');
  for (let i = 0; i < 50; i++) {
    const used = cpu.step();
    if (mem._memWrites.length > 0) console.log(`t=${cpu.tstates} memWrites so far:`, mem._memWrites.map(w=>({addr: w.addr.toString(16), val: w.value, t: w.t})));
    if (cpu.halted) { console.log('CPU halted at t=', cpu.tstates); break; }
  }

  const out = { tstates: cpu.tstates, memWrites: mem._memWrites || [], portWrites: (globalThis && globalThis._portWrites) ? globalThis._portWrites : [] };
  const outPath = new URL('../../traces/debug_loop.json', import.meta.url).pathname;
  await import('fs').then(fs => fs.promises.writeFile(outPath, JSON.stringify(out, null, 2)));
  console.log('Wrote debug_loop.json ->', outPath);
})();