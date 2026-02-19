import { Memory } from '../src/memory.mjs';
import { Emulator } from '../src/main.mjs';

function scenario(port) {
  const mem = new Memory({ model: '48k', contention: true });
  const cpu = { tstates: 0, frameStartTstates: 0 };
  mem.attachCPU(cpu);
  const emu = new Emulator({ canvas: { width: 320, height: 240, style: {} }, statusEl: {} });
  emu.cpu = cpu; emu.memory = mem;

  // align to first contended tstate
  cpu.tstates = mem._firstContended;
  const before = cpu.tstates;
  emu._applyIOContention(port);
  const delta = cpu.tstates - before;
  console.log(`port=0x${port.toString(16)} delta=${delta}`);
  return { delta, mem, cpu };
}

console.log('--- ULA port (0x40FE) ---');
const r1 = scenario(0x40FE);
console.log('expected detailed: mem._contentionTable[first] + 1 + mem._contentionTable[first+1] + 3');
console.log('contention[first..+1]=', r1.mem._contentionTable[r1.mem._firstContended], r1.mem._contentionTable[r1.mem._firstContended+1]);

console.log('--- non-ULA port (0x40FF) ---');
const r2 = scenario(0x40FF);
console.log('expected detailed: sum of contentionTable[first..first+3] + 4');
console.log('contention[first..+3]=', r2.mem._contentionTable[r2.mem._firstContended], r2.mem._contentionTable[r2.mem._firstContended+1], r2.mem._contentionTable[r2.mem._firstContended+2], r2.mem._contentionTable[r2.mem._firstContended+3]);
