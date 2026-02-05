import {Z80} from './src/z80.mjs';
import {Memory} from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const mem = new Memory();
const cpu = new Z80(mem);
mem.attachCPU(cpu);
mem.loadROM(rom.bytes);
cpu.reset();

let steps = 0;
while (steps < 20000 && cpu.PC < 0x1200) {
  const pc = cpu.PC;
  if (pc >= 0x11d0 && pc <= 0x11ef) {
    console.log(`PC=${pc.toString(16)} A=${cpu.A.toString(16)} BC=${cpu._getBC().toString(16)} DE=${cpu._getDE().toString(16)} HL=${cpu._getHL().toString(16)} SP=${cpu.SP.toString(16)}`);
  }
  steps += cpu.step();
}
console.log('done at PC', cpu.PC.toString(16), 'steps', steps);
