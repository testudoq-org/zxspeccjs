/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Deep trace into RST 10 to see what's happening at each step
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
let traceNext = false;
let traceInstructions = 0;
let rst10Count = 0;

// Key ROM addresses in print path
const printAddrs = {
  0x0010: 'RST 10 entry',
  0x0015: 'PRINT-A-1',
  0x09F4: 'PRINT-OUT',
  0x0B03: 'PO-FETCH',
  0x0B24: 'PO-CHAR',
  0x0B38: 'PO-CHAR-2',
  0x0B4C: 'PO-CHAR-3',
  0x0B52: 'PO-STORE',
  0x0B5F: 'PO-ST-E',
  0x0B65: 'PO-ST-PR',
  0x0B7F: 'PO-SCR',
  0x0B93: 'PR-ALL',
  0x0BA4: 'PR-ALL-1',
  0x0BB6: 'PR-ALL-2',
  0x0BC1: 'PR-ALL-3',
  0x0BD3: 'PR-ALL-4',
  0x0BDB: 'PR-ALL-5',
  0x0BDB: 'PR-ALL-6',
};

function disassemble(pc) {
  const op = memory.read(pc);
  const op2 = memory.read(pc + 1);
  const op3 = memory.read(pc + 2);
  
  // Very basic disassembly for common opcodes
  switch (op) {
    case 0x00: return 'NOP';
    case 0xC9: return 'RET';
    case 0xE1: return 'POP HL';
    case 0xD1: return 'POP DE';
    case 0xC1: return 'POP BC';
    case 0xE5: return 'PUSH HL';
    case 0xD5: return 'PUSH DE';
    case 0xC5: return 'PUSH BC';
    case 0xCD: return `CALL 0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0xC3: return `JP 0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0xCA: return `JP Z,0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0xC2: return `JP NZ,0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0xDA: return `JP C,0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0xD2: return `JP NC,0x${(op2 | (op3 << 8)).toString(16)}`;
    case 0x18: return `JR ${(op2 > 127 ? op2 - 256 : op2)}`;
    case 0x20: return `JR NZ,${(op2 > 127 ? op2 - 256 : op2)}`;
    case 0x28: return `JR Z,${(op2 > 127 ? op2 - 256 : op2)}`;
    case 0x3E: return `LD A,0x${op2.toString(16)}`;
    case 0x77: return 'LD (HL),A';
    case 0x7E: return 'LD A,(HL)';
    case 0x23: return 'INC HL';
    case 0x2B: return 'DEC HL';
    case 0xFE: return `CP 0x${op2.toString(16)}`;
    case 0xED:
      switch (op2) {
        case 0xB0: return 'LDIR';
        case 0xB8: return 'LDDR';
        default: return `ED ${op2.toString(16)}`;
      }
    default: return `0x${op.toString(16)}`;
  }
}

function runFrame() {
  let frameT = 0;
  
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
  
  while (frameT < FRAME_TSTATES) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    if (!eiReached && cpu.IFF1) {
      eiReached = true;
      console.log(`\nEI reached at frame ${frameCount}\n`);
    }
    
    // Start tracing at RST 10
    if (opcode === 0xD7 && eiReached && rst10Count < 2) { // RST 10
      rst10Count++;
      traceNext = true;
      traceInstructions = 0;
      console.log(`\n========== RST 10 #${rst10Count} - Char '${cpu.A >= 32 && cpu.A < 127 ? String.fromCharCode(cpu.A) : '?'}' (0x${cpu.A.toString(16)}) ==========`);
      console.log(`  CHARS addr: 0x${(memory.read(0x5C36) | (memory.read(0x5C37) << 8)).toString(16)}`);
    }
    
    // Trace print path
    if (traceNext && traceInstructions < 500) {
      const label = printAddrs[pc] || '';
      if (label || traceInstructions < 50) {
        const instr = disassemble(pc);
        console.log(`  ${label ? '[' + label + '] ' : ''}0x${pc.toString(16)}: ${instr}  | A=${cpu.A.toString(16)} HL=${cpu._getHL().toString(16)} DE=${cpu._getDE().toString(16)}`);
      }
      traceInstructions++;
      
      // Stop tracing after RET from print
      if (opcode === 0xC9 && pc === 0x0014) {
        console.log('  === RET from PRINT-A ===\n');
        traceNext = false;
      }
    }
    
    // HALT detection
    if (opcode === 0x76 && !cpu.IFF1) break;
    if (opcode === 0x76) {
      frameT = FRAME_TSTATES;
      break;
    }
    
    const tsBefore = cpu.tstates;
    cpu.step();
    frameT += (cpu.tstates - tsBefore);
  }
  
  cpu.intRequested = false;
  frameCount++;
}

console.log('=== Deep trace of RST 10 ===');
console.log('Looking at ROM addresses 0x0010-0x0BFF (print routines)\n');

// Run frames
for (let f = 0; f < 100; f++) {
  runFrame();
}

console.log('\n=== Final video memory check ===');
let nonZero = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
  if (memory.read(addr) !== 0) nonZero++;
}
console.log(`Non-zero video bytes: ${nonZero}`);

