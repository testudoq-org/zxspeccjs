// Find ROM writes to LAST_K (0x5C08)
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function traceLastKWrites() {
  console.log('=== Trace Writes to LAST_K (0x5C08) ===\n');

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
    memory.write(i, i === 0x5C08 ? 0x00 : 0xFF);  // LAST_K = 0 to spot writes
  }
  memory.write(0x5C3B, 0x40); // FLAGS

  // Instrument memory writes
  const originalWrite = memory.write.bind(memory);
  memory.write = (addr, value) => {
    if (addr >= 0x5C00 && addr <= 0x5C0A) {
      const pc = cpu.PC;
      const names = ['KSTATE0[0]', 'KSTATE0[1]', 'KSTATE0[2]', 'KSTATE0[3]',
                     'KSTATE1[0]', 'KSTATE1[1]', 'KSTATE1[2]', 'KSTATE1[3]',
                     'LAST_K', 'REPDEL', 'REPPER'];
      console.log(`WRITE 0x${addr.toString(16)} (${names[addr - 0x5C00]}) = 0x${value.toString(16)} at PC=0x${pc.toString(16)}`);
    }
    return originalWrite(addr, value);
  };

  cpu.IY = 0x5C3A;
  cpu.SP = 0xFF00;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  // Run keyboard interrupt
  cpu.PC = 0x02BF;
  cpu.SP -= 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  
  let steps = 0;
  while (steps < 500 && cpu.PC !== 0x1200) {
    cpu.step();
    steps++;
  }

  console.log('\n=== Final State ===');
  console.log(`LAST_K: 0x${memory.read(0x5C08).toString(16)}`);
  console.log(`KSTATE1[0]: 0x${memory.read(0x5C04).toString(16)}`);
}

traceLastKWrites().catch(console.error);
