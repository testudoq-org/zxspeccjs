#!/usr/bin/env node
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

(async function(){
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);

  // Program at 0x8000 (same as capture harness)
  const code = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x02, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];
  const base = 0x8000 - 0x4000;
  for (let i = 0; i < code.length; i++) mem.pages[1][base + i] = code[i];

  cpu.PC = 0x8000; cpu.A = 0xAA; cpu.B = 0x10;
  cpu._microTraceEnabled = true; cpu._microLog = [];
  mem._memWrites = [];

  cpu.frameStartTstates = 0; cpu.tstates = 0;
  cpu.runFor(69888);

  console.log('=== CPU microLog (tail 60) ===');
  console.log(cpu._microLog.slice(-60));
  console.log('\n=== mem._memWrites (all entries in 0x4000..0x400F) ===');
  console.log((mem._memWrites||[]).filter(w => w.addr >= 0x4000 && w.addr < 0x4010));
  console.log('\nFinal PC, tstates:', cpu.PC.toString(16), cpu.tstates);
})();