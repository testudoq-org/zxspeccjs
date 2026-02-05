/**
 * Step-by-step trace of RST 10 to see why HL gets the wrong value
 */
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import spec48 from './src/roms/spec48.js';

const FRAME_TSTATES = 69888;
const rom = new Uint8Array(spec48.bytes);
const memory = new Memory({ model: '48k', romBuffer: rom });
const cpu = new Z80(memory);

let frameCount = 0;
let eiReached = false;
let tracing = false;
let instCount = 0;

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`EI reached at frame ${frameCount}\n`);
    }
    
    // Start trace at first printable char RST 10
    if (opcode === 0xD7 && eiReached && cpu.A === 0x20 && !tracing) {
      tracing = true;
      instCount = 0;
      console.log(`\n=== RST 10 for space (0x20) ===`);
      console.log(`Before RST 10:`);
      console.log(`  A=0x${cpu.A.toString(16)}, HL=0x${cpu._getHL().toString(16)}, HL'=?`);
      console.log(`  CURCHL at 0x5C51: 0x${(memory.read(0x5C51) | (memory.read(0x5C52) << 8)).toString(16)}`);
    }
    
    // Detailed trace through RST 10 sequence
    if (tracing && instCount < 50) {
      const op = memory.read(pc);
      let desc = `0x${pc.toString(16)}: opcode 0x${op.toString(16)}`;
      
      // Decode key instructions
      if (op === 0xD9) desc = `0x${pc.toString(16)}: EXX`;
      if (op === 0xE5) desc = `0x${pc.toString(16)}: PUSH HL`;
      if (op === 0x2A) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `0x${pc.toString(16)}: LD HL,(0x${addr.toString(16)}) - value at addr: 0x${(memory.read(addr) | (memory.read(addr+1) << 8)).toString(16)}`;
      }
      if (op === 0x5E) desc = `0x${pc.toString(16)}: LD E,(HL) - HL=0x${cpu._getHL().toString(16)}, (HL)=0x${memory.read(cpu._getHL()).toString(16)}`;
      if (op === 0x56) desc = `0x${pc.toString(16)}: LD D,(HL) - HL=0x${cpu._getHL().toString(16)}, (HL)=0x${memory.read(cpu._getHL()).toString(16)}`;
      if (op === 0x23) desc = `0x${pc.toString(16)}: INC HL - HL before: 0x${cpu._getHL().toString(16)}`;
      if (op === 0xEB) desc = `0x${pc.toString(16)}: EX DE,HL - DE=0x${cpu._getDE().toString(16)}, HL=0x${cpu._getHL().toString(16)}`;
      if (op === 0xE9) desc = `0x${pc.toString(16)}: JP (HL) - jumping to 0x${cpu._getHL().toString(16)}`;
      if (op === 0xC3) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `0x${pc.toString(16)}: JP 0x${addr.toString(16)}`;
      }
      if (op === 0xCD) {
        const addr = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `0x${pc.toString(16)}: CALL 0x${addr.toString(16)}`;
      }
      
      console.log(`  [${instCount}] ${desc}`);
      console.log(`       A=${cpu.A.toString(16)} HL=${cpu._getHL().toString(16)} DE=${cpu._getDE().toString(16)} BC=${cpu._getBC().toString(16)}`);
      
      instCount++;
      
      // Stop after JP (HL)
      if (op === 0xE9) {
        console.log(`\n  === JP (HL) executed, jumped to 0x${cpu._getHL().toString(16)} ===`);
        tracing = false;
      }
    }
    
    if (opcode === 0x76 && !cpu.IFF1) break;
    if (opcode === 0x76) { frameT = FRAME_TSTATES; break; }
    
    const tsBefore = cpu.tstates;
    cpu.step();
    frameT += (cpu.tstates - tsBefore);
  }
  
  cpu.intRequested = false;
  frameCount++;
}

console.log('=== Step-by-step RST 10 trace ===\n');

// Show expected values
console.log('Expected behavior:');
console.log('  CURCHL = 0x5CB6');
console.log('  At 0x5CB6: output routine = 0x09F4');
console.log('  So JP (HL) should jump to 0x09F4\n');

for (let f = 0; f < 100; f++) {
  runFrame();
  if (!tracing && instCount > 0) break;
}
