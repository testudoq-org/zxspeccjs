import { Memory } from '../src/memory.mjs';
const mem = new Memory({ model: '48k' });
console.log('firstContended=', mem._firstContended);
// attach a CPU so _applyContention can build the table
mem.attachCPU({ tstates: mem._firstContended, frameStartTstates: 0 });
mem._applyContention(0x4000);
console.log('contentionTable[@firstContended..+8]=', Array.from(mem._contentionTable.slice(mem._firstContended, mem._firstContended + 8)));
console.log('contentionTable[@firstContended+0..+16]=', Array.from(mem._contentionTable.slice(mem._firstContended, mem._firstContended + 16)));
