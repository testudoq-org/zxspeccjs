/* eslint-disable no-console, no-undef, no-unused-vars */
// Trace with memory state at each step
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function traceWithMemory() {
  console.log('=== Trace with Memory State ===\n');

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
        return result & 0xFF;
      }
      return 0xFF;
    },
    write: () => {}
  };

  // Initialize system variables
  for (let i = 0x5C00; i < 0x5C10; i++) {
    memory.write(i, 0xFF);
  }
  memory.write(0x5C3B, 0x40); // FLAGS

  // Start at KEYBOARD routine
  cpu.PC = 0x02BF;
  cpu.SP = 0xFF00 - 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  cpu.IY = 0x5C3A;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  console.log('Initial KSTATE: ' + Array.from({length: 8}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2, '0')).join(' '));
  console.log('');

  let steps = 0;
  
  while (steps < 200 && cpu.PC !== 0x1200) {
    const pc = cpu.PC;
    
    // Focus on the problematic area (steps 118-125)
    if (steps >= 118 && steps <= 130) {
      const opcode = memory.read(pc);
      const op2 = memory.read(pc + 1);
      
      const state = `A=${cpu.A.toString(16).padStart(2,'0')} ` +
                    `DE=${((cpu.D << 8) | cpu.E).toString(16).padStart(4,'0')} ` +
                    `HL=${((cpu.H << 8) | cpu.L).toString(16).padStart(4,'0')} ` +
                    `F=${cpu.F.toString(16).padStart(2,'0')}`;

      const hlAddr = (cpu.H << 8) | cpu.L;
      const memAtHL = memory.read(hlAddr);
      const kstate = Array.from({length: 4}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2, '0')).join(' ');
      
      console.log(`${steps}: PC=${pc.toString(16).padStart(4,'0')} [${opcode.toString(16).padStart(2,'0')} ${op2.toString(16).padStart(2,'0')}] ${state}`);
      console.log(`    (HL)=0x${memAtHL.toString(16).padStart(2,'0')} at 0x${hlAddr.toString(16).padStart(4,'0')}, KSTATE[0-3]: ${kstate}`);
    }
    
    cpu.step();
    steps++;
    
    if (steps > 150) break;
  }

  console.log(`\n=== Final State ===`);
  console.log(`KSTATE: ${Array.from({length: 8}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2, '0')}`);
}

traceWithMemory().catch(console.error);

