// Detailed ROM boot sequence trace
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

const memory = new Memory();
const cpu = new Z80(memory);

memory.loadROM(rom.bytes);
cpu.reset();

console.log('=== ROM Boot Trace ===');
console.log('First 10 ROM bytes:', Array.from(rom.bytes.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

// Trace first 50 instructions
console.log('\n=== First 50 instructions ===');
for (let i = 0; i < 50; i++) {
  const pc = cpu.PC;
  const opcode = memory.read(pc);
  const op1 = memory.read(pc + 1);
  const op2 = memory.read(pc + 2);
  
  let name = getOpcodeName(opcode, op1, op2);
  
  const HL = (cpu.H << 8) | cpu.L;
  const DE = (cpu.D << 8) | cpu.E;
  
  console.log(`${i.toString().padStart(3, ' ')}: PC=0x${pc.toString(16).padStart(4, '0')} op=0x${opcode.toString(16).padStart(2, '0')} ${name} | A=${cpu.A.toString(16).padStart(2,'0')} HL=${HL.toString(16).padStart(4,'0')} DE=${DE.toString(16).padStart(4,'0')} SP=${cpu.SP.toString(16).padStart(4,'0')}`);
  
  cpu.step();
}

function getOpcodeName(opcode, op1, op2) {
  const addr = (op2 << 8) | op1;
  switch (opcode) {
    case 0x00: return 'NOP';
    case 0xF3: return 'DI';
    case 0xFB: return 'EI';
    case 0xAF: return 'XOR A';
    case 0x11: return `LD DE,0x${addr.toString(16).padStart(4,'0')}`;
    case 0x21: return `LD HL,0x${addr.toString(16).padStart(4,'0')}`;
    case 0x31: return `LD SP,0x${addr.toString(16).padStart(4,'0')}`;
    case 0xC3: return `JP 0x${addr.toString(16).padStart(4,'0')}`;
    case 0xCD: return `CALL 0x${addr.toString(16).padStart(4,'0')}`;
    case 0xC9: return 'RET';
    case 0x76: return 'HALT';
    case 0x3E: return `LD A,0x${op1.toString(16).padStart(2,'0')}`;
    case 0xD3: return `OUT (0x${op1.toString(16).padStart(2,'0')}),A`;
    case 0xED: return `ED prefix (0x${op1.toString(16).padStart(2,'0')})`;
    case 0x36: return `LD (HL),0x${op1.toString(16).padStart(2,'0')}`;
    case 0x2B: return 'DEC HL';
    case 0xBC: return 'CP H';
    case 0x20: return `JR NZ,rel=${(op1 > 127 ? op1 - 256 : op1)}`;
    case 0x47: return 'LD B,A';
    case 0x62: return 'LD H,D';
    case 0x6B: return 'LD L,E';
    default: return '';
  }
}
