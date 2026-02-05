// Trace KEYBOARD routine with key addresses highlighted
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function traceKeyboard() {
  console.log('=== KEYBOARD Routine Trace ===\n');

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
  for (let i = 0x5C00; i <= 0x5C07; i++) memory.write(i, 0xFF);
  memory.write(0x5C08, 0xFF); // LAST_K
  memory.write(0x5C09, 35);   // REPDEL
  memory.write(0x5C0A, 5);    // REPPER
  memory.write(0x5C3B, 0x40); // FLAGS
  memory.write(0x5C41, 0);    // MODE

  // Set up CPU state for KEYBOARD entry
  cpu.PC = 0x02BF;
  cpu.SP = 0xFF00 - 2;
  memory.write(cpu.SP, 0x00);
  memory.write(cpu.SP + 1, 0x12);
  cpu.IY = 0x5C3A;
  cpu.IFF1 = false;
  cpu.IFF2 = false;

  // Key routine addresses in KEYBOARD (0x02BF onwards)
  const keyAddrs = {
    0x02BF: 'KEYBOARD: CALL KEY-SCAN',
    0x02C2: 'RET NC (no key)',
    0x02C3: 'LD HL,KSTATE',
    0x02C6: 'BIT 7,(HL)',
    0x02C8: 'JR NZ,K-ST-LOOP',
    0x02CA: 'INC HL',
    0x02CB: 'BIT 7,(HL)',
    0x02CD: 'JR Z,K-CH-SET',
    0x02CF: 'DEC (HL)',
    0x02D0: 'INC HL',
    0x02D1: 'LD A,(HL)',
    0x02D2: 'INC HL',
    0x02D3: 'CP E',
    0x02D4: 'JR NZ,K-TEST-IN',
    0x02D6: 'CP D',
    0x02D8: 'JR NZ,K-TEST-IN',
    0x02DA: 'DEC HL',
    0x02DB: 'LD (HL),A',
    0x02DC: 'INC HL',
    0x02DD: 'JR K-END',
    0x02DF: 'K-NEW: LD (HL),A', // Store new key in KSTATE
    0x02E0: 'INC HL',
    0x02E1: 'LD (HL),E',
    0x02E2: 'INC HL',
    0x02E3: 'LD (HL),D',
    0x02E4: 'K-END: DEC HL',
    0x02E5: 'DEC HL',
    0x02E6: 'DEC HL',
    0x02E7: 'LD (HL),#05',
    0x02E9: 'RET',
    0x02EA: 'K-CH-SET: LD A,E',
    0x02EB: 'ADD A,D',
    0x02EC: 'JR NC,K-NEW',
  };

  let steps = 0;
  const maxSteps = 200;
  
  while (steps < maxSteps && cpu.PC !== 0x1200) {
    const pc = cpu.PC;
    const desc = keyAddrs[pc] || '';
    
    if (desc) {
      const state = `A=${cpu.A.toString(16).padStart(2,'0')} D=${cpu.D.toString(16).padStart(2,'0')} E=${cpu.E.toString(16).padStart(2,'0')} HL=${((cpu.H << 8) | cpu.L).toString(16).padStart(4,'0')} F=${cpu.F.toString(16).padStart(2,'0')}`;
      console.log(`${steps.toString().padStart(3)}: PC=${pc.toString(16).padStart(4,'0')} ${state}`);
      console.log(`     ${desc}`);
      
      // Show memory at (HL) for relevant instructions
      if (desc.includes('(HL)') || desc.includes('KSTATE')) {
        const hl = (cpu.H << 8) | cpu.L;
        console.log(`     [HL]=${memory.read(hl).toString(16).padStart(2,'0')}`);
      }
    }
    
    cpu.step();
    steps++;
  }

  console.log('\n=== Final State ===');
  console.log(`KSTATE: ${Array.from({length: 8}, (_, i) => memory.read(0x5C00 + i).toString(16).padStart(2,'0')).join(' ')}`);
  console.log(`LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2,'0')}`);
  console.log(`FLAGS: 0x${memory.read(0x5C3B).toString(16).padStart(2,'0')}`);
}

traceKeyboard().catch(console.error);
