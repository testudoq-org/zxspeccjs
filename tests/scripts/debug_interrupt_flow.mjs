// Debug script to trace interrupt handler execution flow
// This will help us understand if the keyboard routine is being called

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function debugInterruptFlow() {
  console.log('=== Interrupt Handler Flow Debug ===\n');

  // Load ROM
  const romPath = './roms/spec48.rom';
  const romData = fs.readFileSync(romPath);
  console.log(`ROM loaded: ${romData.length} bytes`);

  // Create memory and CPU
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Simulate boot sequence - run until we're past initial boot
  cpu.IFF1 = true; // Enable interrupts
  cpu.IFF2 = true;
  cpu.IM = 1;
  cpu.PC = 0x12A9; // MAIN-1 entry (after boot sequence)
  cpu.SP = 0xFF4A;
  cpu.IY = 0x5C3A;
  
  // Set up system variables as if boot completed
  memory.write(0x5C3B, 0x40); // FLAGS = K mode

  // Collect PC trace during interrupt
  const pcTrace = [];
  let tracing = false;
  let intHandled = false;

  cpu.debugCallback = (opcode, pc) => {
    if (tracing && pcTrace.length < 500) {
      pcTrace.push({
        pc: pc,
        opcode: opcode,
        sp: cpu.SP,
        iff1: cpu.IFF1
      });
    }
  };

  // Run a few steps to get to a stable state
  for (let i = 0; i < 100; i++) {
    cpu.step();
  }

  console.log(`CPU state before interrupt:`);
  console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`  SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
  console.log(`  IFF1: ${cpu.IFF1}, IFF2: ${cpu.IFF2}, IM: ${cpu.IM}`);
  console.log(`  FRAMES: 0x${memory.read(0x5C78).toString(16)} 0x${memory.read(0x5C79).toString(16)} 0x${memory.read(0x5C7A).toString(16)}`);

  // Request interrupt and trace execution
  cpu.intRequested = true;
  tracing = true;
  
  // Run steps and trace
  for (let i = 0; i < 500; i++) {
    const prevPC = cpu.PC;
    cpu.step();
    
    // Check if we're back from interrupt (EI + RET executed, PC not in 0x0038-0x0400 range)
    if (prevPC === 0x0052 && cpu.IFF1) {
      // 0x0052 is where RET is in the interrupt handler
      console.log(`\nInterrupt handler completed at step ${i}`);
      console.log(`  Returned to PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
      break;
    }
  }

  tracing = false;

  console.log(`\nPC trace (${pcTrace.length} entries):`);
  
  // Analyze the trace
  const inIntHandler = pcTrace.filter(t => t.pc >= 0x0038 && t.pc <= 0x0053);
  const inKbRoutine = pcTrace.filter(t => t.pc >= 0x02BF && t.pc <= 0x0320);
  const inKeyScan = pcTrace.filter(t => t.pc >= 0x028E && t.pc <= 0x02BF);
  
  console.log(`  In INT handler (0x0038-0x0053): ${inIntHandler.length} steps`);
  console.log(`  In KB routine (0x02BF-0x0320): ${inKbRoutine.length} steps`);
  console.log(`  In KEY-SCAN (0x028E-0x02BF): ${inKeyScan.length} steps`);

  // Show first 50 trace entries
  console.log('\nFirst 50 PC values:');
  for (let i = 0; i < Math.min(50, pcTrace.length); i++) {
    const t = pcTrace[i];
    console.log(`  ${i.toString().padStart(3)}: PC=0x${t.pc.toString(16).padStart(4,'0')} OP=0x${t.opcode.toString(16).padStart(2,'0')} SP=0x${t.sp.toString(16).padStart(4,'0')} IFF1=${t.iff1?1:0}`);
  }

  // Check if CALL 0x02BF was reached
  const call02BF = pcTrace.find(t => t.pc === 0x004A); // Address of CALL 0x02BF instruction
  const reached02BF = pcTrace.find(t => t.pc === 0x02BF);
  const reached028E = pcTrace.find(t => t.pc === 0x028E);

  console.log(`\nKey addresses reached:`);
  console.log(`  0x004A (CALL 0x02BF instruction): ${call02BF ? 'YES' : 'NO'}`);
  console.log(`  0x02BF (KB routine entry): ${reached02BF ? 'YES' : 'NO'}`);
  console.log(`  0x028E (KEY-SCAN entry): ${reached028E ? 'YES' : 'NO'}`);

  console.log(`\n=== End Debug ===`);
}

debugInterruptFlow().catch(console.error);
