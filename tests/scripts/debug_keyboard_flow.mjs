// Debug script to trace keyboard detection during interrupt
// Simulates a key press and traces through KEY-SCAN

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

async function debugKeyboardFlow() {
  console.log('=== Keyboard Detection Flow Debug ===\n');

  // Load ROM
  const romPath = './roms/spec48.rom';
  const romData = fs.readFileSync(romPath);
  console.log(`ROM loaded: ${romData.length} bytes`);

  // Create memory and CPU
  const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
  const cpu = new Z80(memory);

  // Create a simple IO adapter that simulates L key pressed
  let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFD, 0xFF]; // L is row 6, bit 1
  let portReadLog = [];

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
        result |= 0b11100000; // Set upper bits
        portReadLog.push({ port, high, result, pc: cpu.PC, a: cpu.A, bc: (cpu.B << 8) | cpu.C });
        return result & 0xFF;
      }
      return 0xFF;
    },
    write: (port, value) => {}
  };

  // Simulate boot completed state
  cpu.IFF1 = true;
  cpu.IFF2 = true;
  cpu.IM = 1;
  cpu.PC = 0x12A9; // MAIN-1 entry
  cpu.SP = 0xFF4A;
  cpu.IY = 0x5C3A;

  // Initialize system variables as if boot completed
  memory.write(0x5C3B, 0x40); // FLAGS = K mode
  memory.write(0x5C41, 0x00); // MODE = K mode
  
  // Initialize KSTATE area to 0xFF
  for (let i = 0x5C00; i <= 0x5C07; i++) {
    memory.write(i, 0xFF);
  }
  memory.write(0x5C08, 0x00); // LAST_K = 0

  // Read initial KSTATE
  console.log('Before interrupt:');
  console.log(`  KSTATE: [${Array.from({length:8}, (_, i) => '0x' + memory.read(0x5C00 + i).toString(16).padStart(2,'0')).join(', ')}]`);
  console.log(`  LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2, '0')}`);

  // Run a few steps to stabilize
  for (let i = 0; i < 50; i++) {
    cpu.step();
  }

  // Track register values during KEY-SCAN
  const keyScanTrace = [];
  let inKeyScan = false;

  cpu.debugCallback = (opcode, pc) => {
    // Track when we're in KEY-SCAN (0x028E-0x02BF) or KEYBOARD (0x02BF-0x0320)
    if (pc >= 0x028E && pc <= 0x0320) {
      keyScanTrace.push({
        pc,
        opcode,
        a: cpu.A,
        d: cpu.D,
        e: cpu.E,
        bc: (cpu.B << 8) | cpu.C,
        hl: (cpu.H << 8) | cpu.L,
        f: cpu.F,
        inKeyScan: pc >= 0x028E && pc < 0x02BF
      });
    }
    
    // Also track memory writes to KSTATE (0x5C00-0x5C07) and LAST_K (0x5C08)
    if (keyScanTrace.length > 0) {
      // Check for writes after instruction
    }
  };

  // Request interrupt
  cpu.intRequested = true;

  // Run until interrupt handler completes
  let steps = 0;
  let intCompleted = false;
  for (steps = 0; steps < 600; steps++) {
    const prevPC = cpu.PC;
    cpu.step();
    
    // Check if RET from interrupt handler (address 0x0052)
    if (prevPC === 0x0052 && cpu.IFF1) {
      intCompleted = true;
      break;
    }
  }

  console.log(`\nAfter ${steps} steps (interrupt ${intCompleted ? 'completed' : 'in progress'}):`);
  console.log(`  PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`  KSTATE: [${Array.from({length:8}, (_, i) => '0x' + memory.read(0x5C00 + i).toString(16).padStart(2,'0')).join(', ')}]`);
  console.log(`  LAST_K: 0x${memory.read(0x5C08).toString(16).padStart(2, '0')}`);

  // Analyze port reads
  console.log(`\nPort reads during interrupt: ${portReadLog.length}`);
  const keyDetectedReads = portReadLog.filter(r => (r.result & 0x1f) !== 0x1f);
  console.log(`  Reads with key detected: ${keyDetectedReads.length}`);
  if (keyDetectedReads.length > 0) {
    console.log(`  First key detection: port=0x${keyDetectedReads[0].port.toString(16)}, high=0x${keyDetectedReads[0].high.toString(16)}, result=0x${keyDetectedReads[0].result.toString(16)}, pc=0x${keyDetectedReads[0].pc.toString(16)}`);
  }

  // Show KEY-SCAN trace
  console.log(`\nKEY-SCAN trace entries: ${keyScanTrace.length}`);
  if (keyScanTrace.length > 0) {
    console.log('First 110 entries:');
    for (let i = 0; i < Math.min(110, keyScanTrace.length); i++) {
      const t = keyScanTrace[i];
      if (t.note) {
        console.log(`  ${i}: ${t.note} D=0x${t.d.toString(16).padStart(2,'0')} E=0x${t.e.toString(16).padStart(2,'0')}`);
      } else {
        console.log(`  ${i}: PC=0x${t.pc.toString(16).padStart(4,'0')} A=0x${t.a.toString(16).padStart(2,'0')} D=0x${t.d.toString(16).padStart(2,'0')} E=0x${t.e.toString(16).padStart(2,'0')} BC=0x${t.bc.toString(16).padStart(4,'0')}`);
      }
    }
    
    // Show last entry (should be exit with D,E containing key info)
    const last = keyScanTrace[keyScanTrace.length - 1];
    console.log(`\nLast entry (should be KEY-SCAN return):`);
    console.log(`  D=0x${last.d.toString(16).padStart(2,'0')} E=0x${last.e.toString(16).padStart(2,'0')}`);
    console.log(`  D=column value (0-4 for valid key), E=row value (0-7 for valid key)`);
    console.log(`  D=0xFF and E=0xFF means no key detected`);
  }

  // Check L key expected values
  console.log('\nExpected for L key:');
  console.log('  Row 6 = ENTER, L, K, J, H → L is bit 1');
  console.log('  L key: D should be 0x01 (column), E should be 0x26 (row offset + something)');
  console.log('  Actually checking ROM KEY-SCAN output format...');

  console.log(`\n=== End Debug ===`);
}

debugKeyboardFlow().catch(console.error);
