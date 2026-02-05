// Trace K-DECODE routine
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function traceKDecode() {
  console.log('=== Trace K-DECODE Routine ===\n');

  const romData = fs.readFileSync('./roms/spec48.rom');
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate L key pressed
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

  cpu.IY = 0x5C3A;
  cpu.SP = 0xFF00;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  // Run keyboard interrupt and watch K-DECODE
  cpu.PC = 0x02BF;
  cpu.SP -= 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  
  let steps = 0;
  let inKDecode = false;
  let kDecodeSteps = [];
  
  while (steps < 500 && cpu.PC !== 0x1200) {
    const pc = cpu.PC;
    
    // Track when we enter/exit K-DECODE
    if (pc === 0x0333) {
      inKDecode = true;
      console.log(`\n=== Entering K-DECODE at step ${steps} ===`);
      console.log(`  A=0x${cpu.A.toString(16)}, E=0x${cpu.E.toString(16)}, D=0x${cpu.D.toString(16)}, C=0x${cpu.C.toString(16)}`);
    }
    
    if (inKDecode) {
      const opcode = memory.read(pc);
      const op2 = memory.read(pc + 1);
      kDecodeSteps.push({
        pc,
        a: cpu.A,
        e: cpu.E,
        opcode: `${opcode.toString(16).padStart(2,'0')} ${op2.toString(16).padStart(2,'0')}`
      });
      
      // Check for RET
      if (opcode === 0xC9) {
        console.log(`\n=== K-DECODE returning at step ${steps} ===`);
        console.log(`  A=0x${cpu.A.toString(16)} (this goes to LAST_K)`);
        console.log(`  Expected: 0x4C = 'L'`);
        inKDecode = false;
        
        // Print key steps
        console.log('\nK-DECODE trace (first 20 steps):');
        for (let i = 0; i < Math.min(20, kDecodeSteps.length); i++) {
          const s = kDecodeSteps[i];
          console.log(`  PC=${s.pc.toString(16).padStart(4,'0')} [${s.opcode}] A=0x${s.a.toString(16).padStart(2,'0')} E=0x${s.e.toString(16).padStart(2,'0')}`);
        }
      }
    }
    
    cpu.step();
    steps++;
  }
}

traceKDecode().catch(console.error);
