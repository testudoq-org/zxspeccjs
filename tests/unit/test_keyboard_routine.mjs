// Test full KEYBOARD routine (0x02BF) with L key pressed
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function testKeyboard() {
  console.log('=== Full KEYBOARD Routine Test ===\n');

  const romData = fs.readFileSync('./roms/spec48.rom');
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate L key pressed on row 6 (bit 1)
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

  // Initialize system variables as ROM would
  // KSTATE: 0x5C00 - 0x5C07
  for (let i = 0x5C00; i <= 0x5C07; i++) memory.write(i, 0xFF);
  
  // LAST_K: 0x5C08
  memory.write(0x5C08, 0xFF);
  
  // REPDEL: 0x5C09 - repeat delay (35 typical)
  memory.write(0x5C09, 35);
  
  // REPPER: 0x5C0A - repeat period (5 typical)
  memory.write(0x5C0A, 5);
  
  // FLAGS: 0x5C3B - bit 3 = K decode mode (ASCII), bit 5 = new key, bit 6 = K mode
  memory.write(0x5C3B, 0x48); // K mode + K decode for ASCII output
  
  // MODE: 0x5C41
  memory.write(0x5C41, 0);

  // Set up CPU state for KEYBOARD entry
  cpu.PC = 0x02BF;
  cpu.SP = 0xFF00 - 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12); // Return address 0x1200
  cpu.IY = 0x5C3A;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  console.log('Before KEYBOARD:');
  console.log(`  KSTATE[0]: 0x${memory.read(0x5C00).toString(16).padStart(2,'0')}`);
  console.log(`  LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2,'0')}`);
  console.log(`  FLAGS: 0x${memory.read(0x5C3B).toString(16).padStart(2,'0')}`);
  console.log('');

  // Run KEYBOARD routine
  let steps = 0;
  const maxSteps = 2000;
  
  while (steps < maxSteps) {
    const pc = cpu.PC;
    
    // Check for return to our fake return address
    if (pc === 0x1200) {
      console.log(`Returned after ${steps} steps`);
      break;
    }
    
    cpu.step();
    steps++;
  }

  if (steps >= maxSteps) {
    console.log(`Stopped after ${maxSteps} steps at PC=0x${cpu.PC.toString(16)}`);
  }

  console.log('\nAfter KEYBOARD:');
  console.log(`  KSTATE[0-3]: ${memory.read(0x5C00).toString(16).padStart(2,'0')} ${memory.read(0x5C01).toString(16).padStart(2,'0')} ${memory.read(0x5C02).toString(16).padStart(2,'0')} ${memory.read(0x5C03).toString(16).padStart(2,'0')}`);
  console.log(`  KSTATE[4-7]: ${memory.read(0x5C04).toString(16).padStart(2,'0')} ${memory.read(0x5C05).toString(16).padStart(2,'0')} ${memory.read(0x5C06).toString(16).padStart(2,'0')} ${memory.read(0x5C07).toString(16).padStart(2,'0')}`);
  console.log(`  LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2,'0')}`);
  console.log(`  FLAGS: 0x${memory.read(0x5C3B).toString(16).padStart(2,'0')} (bit5=${(memory.read(0x5C3B) & 0x20) ? 1 : 0} = new key)`);
  
  // Decode what key was detected
  const lastK = memory.read(0x5C08);
  if (lastK !== 0xFF) {
    // L key should be 0x4C (ASCII 'L') or key code
    console.log(`  L key ASCII would be: 0x${(0x4C).toString(16)} = '${String.fromCharCode(0x4C)}'`);
    console.log(`  Actual LAST_K: 0x${lastK.toString(16)} = '${lastK >= 32 && lastK < 127 ? String.fromCharCode(lastK) : '?'}'`);
  }
}

testKeyboard().catch(console.error);
