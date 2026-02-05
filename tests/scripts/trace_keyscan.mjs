// Detailed KEY-SCAN trace - step through key detection logic
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function traceKeyScan() {
  console.log('=== Detailed KEY-SCAN Trace ===\n');

  const romData = fs.readFileSync('./roms/spec48.rom');
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate L key pressed on row 6
  let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFD, 0xFF];

  cpu.io = {
    read: (port) => {
      if ((port & 0xFF) === 0xFE) {
        const high = (port >> 8) & 0xFF;
        let result = 0xFF;
        for (let row = 0; row < 8; row++) {
          if (((high >> row) & 0x01) === 0) {
            result &= keyMatrix[row];
          }
        }
        result |= 0b11100000;
        console.log(`    [IO] Port 0x${port.toString(16)}: high=0x${high.toString(16)} → result=0x${result.toString(16)}`);
        return result & 0xFF;
      }
      return 0xFF;
    },
    write: () => {}
  };

  // Set up CPU state for KEY-SCAN entry
  cpu.PC = 0x028E;
  cpu.SP = 0xFF00 - 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  cpu.IY = 0x5C3A;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  console.log('Starting KEY-SCAN at 0x028E\n');

  // Key addresses to watch
  const keyAddrs = {
    0x028E: 'LD L,0x2F',
    0x0290: 'LD DE,0xFFFF',
    0x0293: 'LD BC,0xFEFE',
    0x0296: 'IN A,(C)',
    0x0298: 'CPL',
    0x0299: 'AND 0x1F',
    0x029B: 'JR Z,+14 (skip if no key)',
    0x029D: 'LD H,A (key found!)',
    0x029E: 'LD A,L',
    0x029F: 'INC D (column loop)',
    0x02A0: 'RET NZ (return if D!=0)',
    0x02A1: 'SUB 0x08',
    0x02A3: 'SRL H',
    0x02A5: 'JR NC,-6 (loop if bit was 0)',
    0x02A7: 'LD D,E',
    0x02A8: 'LD E,A',
    0x02A9: 'JR NZ,-12 (loop if A!=0)',
    0x02AB: 'DEC L',
    0x02AC: 'RLC B',
    0x02AE: 'JR C,-26 (next row if carry)',
    0x02B0: 'RET (end - no key)'
  };

  let steps = 0;
  let keyDetectionStarted = false;
  
  while (steps < 200 && cpu.PC !== 0x1200) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    const desc = keyAddrs[pc] || '';
    
    // Format register state
    const state = `A=${cpu.A.toString(16).padStart(2,'0')} ` +
                  `B=${cpu.B.toString(16).padStart(2,'0')} ` +
                  `C=${cpu.C.toString(16).padStart(2,'0')} ` +
                  `D=${cpu.D.toString(16).padStart(2,'0')} ` +
                  `E=${cpu.E.toString(16).padStart(2,'0')} ` +
                  `H=${cpu.H.toString(16).padStart(2,'0')} ` +
                  `L=${cpu.L.toString(16).padStart(2,'0')} ` +
                  `F=${cpu.F.toString(16).padStart(2,'0')}`;

    // Only log key instruction addresses
    if (desc) {
      console.log(`${steps.toString().padStart(3)}: PC=${pc.toString(16).padStart(4,'0')} ${state}`);
      console.log(`     ${desc}`);
      
      // Highlight key detection
      if (pc === 0x029D) {
        console.log('     >>> KEY DETECTED IN THIS ROW! <<<');
        keyDetectionStarted = true;
      }
    }
    
    cpu.step();
    steps++;
    
    // Show state after key instructions
    if (desc && (pc === 0x02A3 || pc === 0x029F)) {
      console.log(`     After: A=${cpu.A.toString(16).padStart(2,'0')} H=${cpu.H.toString(16).padStart(2,'0')} D=${cpu.D.toString(16).padStart(2,'0')} F=${cpu.F.toString(16).padStart(2,'0')} (C=${cpu.F & 1 ? 1 : 0}, Z=${cpu.F & 0x40 ? 1 : 0})`);
    }
  }

  console.log(`\n=== Final Result ===`);
  console.log(`D: 0x${cpu.D.toString(16).padStart(2,'0')}`);
  console.log(`E: 0x${cpu.E.toString(16).padStart(2,'0')}`);
  console.log(`Flags: Z=${cpu.F & 0x40 ? 1 : 0}, C=${cpu.F & 1 ? 1 : 0}`);
  
  console.log('\n=== Expected for L key ===');
  console.log('L is in row 6 (0xBFFE), column 1 (bit 1)');
  console.log('Expected: D=column(1), E=row_offset(0x29 or similar)');
}

traceKeyScan().catch(console.error);
