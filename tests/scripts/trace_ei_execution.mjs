/* eslint-disable no-console, no-undef, no-unused-vars */
// Test to trace execution and find where EI is executed
import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import rom from './src/roms/spec48.js';

// Create components
const memory = new Memory();
const cpu = new Z80(memory);

// Load ROM
memory.loadROM(rom.bytes);

// Reset CPU
cpu.reset();

console.log('=== Initial CPU state ===');
console.log(`PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`IFF1: ${cpu.IFF1}, IFF2: ${cpu.IFF2}`);
console.log(`ROM at 0x0000: 0x${memory.read(0).toString(16)} (should be 0xF3 = DI)`);
console.log(`ROM at 0x0051: 0x${memory.read(0x51).toString(16)} (should be 0xFB = EI)`);

// Patch the EI instruction to log when executed
const originalStep = cpu.step.bind(cpu);
let eiExecuted = false;
let eiPC = null;
let instructionCount = 0;
let pcHistory = [];

// Run CPU and trace execution
console.log('\n=== Running CPU (looking for EI instruction) ===');

const TSTATES_PER_FRAME = 69888;
const MAX_FRAMES = 10;

for (let frame = 0; frame < MAX_FRAMES; frame++) {
  let tStates = 0;
  
  while (tStates < TSTATES_PER_FRAME) {
    const pc = cpu.PC;
    const opcode = memory.read(pc);
    
    // Track if we execute EI (0xFB)
    if (opcode === 0xFB) {
      console.log(`\n*** EI instruction found at PC=0x${pc.toString(16).padStart(4, '0')}, frame ${frame} ***`);
      console.log(`Before EI: IFF1=${cpu.IFF1}, IFF2=${cpu.IFF2}`);
      eiExecuted = true;
      eiPC = pc;
    }
    
    // Track important PC values
    if (pc < 0x0100 && !pcHistory.includes(pc)) {
      pcHistory.push(pc);
    }
    
    instructionCount++;
    tStates += cpu.step();
    
    if (eiExecuted && opcode === 0xFB) {
      console.log(`After EI: IFF1=${cpu.IFF1}, IFF2=${cpu.IFF2}`);
      if (cpu.IFF1) {
        console.log('SUCCESS: EI instruction worked!');
      } else {
        console.log('FAILURE: EI instruction did not set IFF1!');
      }
    }
    
    // Safety limit
    if (instructionCount > 10000000) {
      console.log('Safety limit reached');
      break;
    }
  }
  
  // Generate interrupt at end of frame (simulate ULA behavior)
  // In real ULA, it only sets intRequested if IFF1 is already true
  // But we want to see if EI ever gets executed
  if (cpu.IFF1) {
    cpu.intRequested = true;
  }
  
  console.log(`Frame ${frame}: ${instructionCount} total instructions, PC=0x${cpu.PC.toString(16).padStart(4, '0')}, IFF1=${cpu.IFF1}`);
  
  if (cpu.IFF1) {
    console.log('\n=== IFF1 is now TRUE! Interrupts enabled! ===');
    break;
  }
}

console.log('\n=== Final State ===');
console.log(`PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`IFF1: ${cpu.IFF1}, IFF2: ${cpu.IFF2}`);
console.log(`EI was executed: ${eiExecuted}`);
if (eiPC) {
  console.log(`EI was at PC: 0x${eiPC.toString(16).padStart(4, '0')}`);
}

console.log('\nPCs visited in first 256 bytes:', pcHistory.slice(0, 20).map(p => '0x' + p.toString(16).padStart(4, '0')).join(', '));

