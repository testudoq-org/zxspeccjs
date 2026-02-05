/**
 * Complete instruction trace during PR-ALL to find out why video isn't written
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
let instrCount = 0;

// Watch all memory writes
const originalWrite = memory.write.bind(memory);
let videoWrites = [];
memory.write = function(addr, val) {
  if (tracing && addr >= 0x4000 && addr < 0x5B00) {
    videoWrites.push({ addr, val, pc: cpu.PC });
  }
  return originalWrite(addr, val);
};

function runFrame() {
  let frameT = 0;
  if (cpu.IFF1) cpu.intRequested = true;
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
    }
    
    // Start tracing at PR-ALL
    if (pc === 0x0B93 && eiReached && !tracing) {
      tracing = true;
      instrCount = 0;
      console.log(`\n=== PR-ALL entered ===`);
      console.log(`A (char) = 0x${cpu.A.toString(16)} '${cpu.A >= 32 && cpu.A < 127 ? String.fromCharCode(cpu.A) : '?'}'`);
      console.log(`HL (screen addr) = 0x${cpu._getHL().toString(16)}`);
      console.log(`DE (font addr) = 0x${cpu._getDE().toString(16)}`);
    }
    
    // Detailed trace of PR-ALL
    if (tracing && instrCount < 100) {
      const op = memory.read(pc);
      let desc = `0x${pc.toString(16)}: op=0x${op.toString(16)}`;
      
      // Decode key instructions
      if (op === 0xED) {
        const op2 = memory.read(pc + 1);
        if (op2 === 0xB0) desc = `0x${pc.toString(16)}: LDIR (HL=0x${cpu._getHL().toString(16)} DE=0x${cpu._getDE().toString(16)} BC=${cpu._getBC()})`;
      }
      if (op === 0x77) desc = `0x${pc.toString(16)}: LD (HL),A - [0x${cpu._getHL().toString(16)}] <- 0x${cpu.A.toString(16)}`;
      if (op === 0x7E) desc = `0x${pc.toString(16)}: LD A,(HL) - A <- [0x${cpu._getHL().toString(16)}]`;
      if (op === 0xC9) desc = `0x${pc.toString(16)}: RET`;
      if (op === 0xCD) {
        const target = memory.read(pc+1) | (memory.read(pc+2) << 8);
        desc = `0x${pc.toString(16)}: CALL 0x${target.toString(16)}`;
      }
      if (op === 0x10) desc = `0x${pc.toString(16)}: DJNZ`;
      
      console.log(`[${instrCount}] ${desc}`);
      console.log(`      HL=0x${cpu._getHL().toString(16)} DE=0x${cpu._getDE().toString(16)} BC=0x${cpu._getBC().toString(16)} A=0x${cpu.A.toString(16)}`);
      
      instrCount++;
      
      // Stop on RET from PR-ALL level
      if (op === 0xC9 && pc === 0x0BD7) { // End of PR-ALL
        console.log(`\n=== Exiting PR-ALL ===`);
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

console.log('=== Complete PR-ALL instruction trace ===');

for (let f = 0; f < 95; f++) {
  runFrame();
  if (!tracing && instrCount > 0) break;
}

console.log('\n=== Video writes during PR-ALL ===');
if (videoWrites.length === 0) {
  console.log('NO VIDEO WRITES!');
} else {
  for (const w of videoWrites.slice(0, 20)) {
    console.log(`  [0x${w.addr.toString(16)}] = 0x${w.val.toString(16)} (from PC=0x${w.pc.toString(16)})`);
  }
}

let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`\nNon-zero video bytes: ${nonZero}`);
