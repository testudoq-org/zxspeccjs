/**
 * Comprehensive Browser Boot Test
 * This script tests the EXACT same code path used by the browser
 * to identify why the copyright message isn't displaying.
 */

import spec48 from './src/roms/spec48.js';
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import { ULA } from './src/ula.mjs';

// Mock canvas for Node.js
class MockCanvas {
  constructor() {
    this.width = 320;
    this.height = 240;
    this.style = {};
  }
  getContext() {
    return {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
      imageSmoothingEnabled: false
    };
  }
}

const TSTATES_PER_FRAME = 69888;

async function runTest() {
  console.log('=== Comprehensive Browser Boot Test ===\n');

  // Step 1: Verify ROM data
  console.log('1. ROM Data Verification:');
  console.log(`   - spec48 module loaded: ${spec48 !== undefined}`);
  console.log(`   - bytes property exists: ${spec48.bytes !== undefined}`);
  console.log(`   - bytes type: ${spec48.bytes?.constructor?.name}`);
  console.log(`   - bytes length: ${spec48.bytes?.length}`);
  console.log(`   - First 10 bytes: ${Array.from(spec48.bytes?.slice(0, 10) || []).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}`);
  
  // Expected ROM start: F3 AF (DI, XOR A)
  const expectedStart = [0xF3, 0xAF];
  const actualStart = Array.from(spec48.bytes.slice(0, 2));
  const romStartCorrect = actualStart[0] === expectedStart[0] && actualStart[1] === expectedStart[1];
  console.log(`   - ROM start correct (F3 AF): ${romStartCorrect ? 'YES' : 'NO - PROBLEM!'}`);

  // Step 2: Create Memory exactly like main.mjs does
  console.log('\n2. Memory Creation (like main.mjs):');
  const memory = new Memory({ model: '48k', romBuffer: spec48.bytes });
  console.log(`   - Memory created: ${memory !== undefined}`);
  console.log(`   - pages[0] exists: ${memory.pages[0] !== undefined}`);
  console.log(`   - pages[0] length: ${memory.pages[0]?.length}`);
  console.log(`   - First byte at 0x0000: 0x${memory.read(0x0000).toString(16).padStart(2, '0')}`);
  console.log(`   - Second byte at 0x0001: 0x${memory.read(0x0001).toString(16).padStart(2, '0')}`);
  
  // RST 38H handler at 0x0038
  const rst38 = memory.read(0x0038);
  console.log(`   - RST 38H (0x0038): 0x${rst38.toString(16).padStart(2, '0')} (expected 0xF5 = PUSH AF)`);
  
  // Copyright string location (around 0x1539)
  const copyrightAddr = 0x1539;
  const copyrightBytes = [];
  for (let i = 0; i < 30; i++) {
    copyrightBytes.push(memory.read(copyrightAddr + i));
  }
  console.log(`   - Copyright at 0x1539: ${copyrightBytes.map(b => String.fromCharCode(b & 0x7F)).join('')}`);

  // Step 3: Create CPU
  console.log('\n3. CPU Creation:');
  const cpu = new Z80(memory);
  cpu.reset();
  console.log(`   - CPU created: ${cpu !== undefined}`);
  console.log(`   - Initial PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`   - Initial SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
  console.log(`   - IFF1: ${cpu.IFF1}`);
  console.log(`   - IFF2: ${cpu.IFF2}`);
  console.log(`   - IM: ${cpu.IM}`);

  // Step 4: Create ULA
  console.log('\n4. ULA Creation:');
  const canvas = new MockCanvas();
  const ula = new ULA(memory, canvas, { useDeferredRendering: true });
  ula.attachCPU(cpu);
  console.log(`   - ULA created: ${ula !== undefined}`);
  console.log(`   - Deferred rendering: ${ula.useDeferredRendering}`);
  console.log(`   - Initial border: ${ula.border}`);

  // Step 5: Create IO adapter (exactly like main.mjs)
  console.log('\n5. IO Adapter:');
  const portWrites = [];
  const ioAdapter = {
    write: (port, value, tstates) => {
      if ((port & 0xFF) === 0xFE) {
        ula.writePort(port, value);
        portWrites.push({ port, value, tstates });
      }
    },
    read: (port) => {
      if ((port & 0xFF) === 0xFE) {
        return ula.readPort(port);
      }
      return 0xFF;
    }
  };
  cpu.io = ioAdapter;
  console.log(`   - IO adapter attached: ${cpu.io !== undefined}`);

  // Step 6: Run boot sequence (simulate 250 frames like main.mjs)
  console.log('\n6. Running Boot Sequence (250 frames):');
  
  let bootComplete = false;
  let eiExecuted = false;
  let copyrightPrintAddr = 0x11CB;
  let reachedCopyrightRoutine = false;
  let pcHistory = [];
  let lastPC = 0;
  
  // Run frames
  for (let frame = 0; frame < 300; frame++) {
    // Run one frame worth of tstates
    let tstatesThisFrame = 0;
    while (tstatesThisFrame < TSTATES_PER_FRAME) {
      const beforePC = cpu.PC;
      const opcode = memory.read(cpu.PC);
      
      // Track PC
      if (pcHistory.length < 1000 || frame % 50 === 0) {
        if (lastPC !== beforePC) {
          pcHistory.push(beforePC);
          if (pcHistory.length > 1000) pcHistory.shift();
          lastPC = beforePC;
        }
      }
      
      // Check for EI instruction
      if (opcode === 0xFB && !eiExecuted) {
        eiExecuted = true;
        console.log(`   - EI executed at frame ${frame}, PC=0x${beforePC.toString(16).padStart(4, '0')}`);
      }
      
      // Check for copyright print routine
      if (beforePC === copyrightPrintAddr && !reachedCopyrightRoutine) {
        reachedCopyrightRoutine = true;
        console.log(`   - Reached copyright print routine (0x11CB) at frame ${frame}`);
      }
      
      // Execute instruction
      const cycles = cpu.step();
      tstatesThisFrame += cycles;
    }
    
    // Generate interrupt at frame boundary
    ula.updateInterruptState();
    if (cpu.IFF1) {
      cpu.intRequested = true;
    }
    
    // Log progress every 50 frames
    if (frame === 50 || frame === 100 || frame === 150 || frame === 200 || frame === 250) {
      console.log(`   - Frame ${frame}: PC=0x${cpu.PC.toString(16).padStart(4, '0')}, IFF1=${cpu.IFF1}, Border=${ula.border}`);
    }
  }

  // Step 7: Check display memory
  console.log('\n7. Display Memory Analysis:');
  
  const bitmap = memory.getBitmapView();
  const attrs = memory.getAttributeView();
  
  let nonZeroPixels = 0;
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] !== 0) nonZeroPixels++;
  }
  
  let defaultAttrs = 0;
  let nonDefaultAttrs = 0;
  for (let i = 0; i < attrs.length; i++) {
    if (attrs[i] === 0x38) {
      defaultAttrs++;
    } else {
      nonDefaultAttrs++;
    }
  }
  
  console.log(`   - Bitmap non-zero bytes: ${nonZeroPixels}/${bitmap.length}`);
  console.log(`   - Attributes at 0x38 (default): ${defaultAttrs}/${attrs.length}`);
  console.log(`   - Attributes non-default: ${nonDefaultAttrs}/${attrs.length}`);
  
  // Check first few text lines (lines 21-23 where copyright should be)
  console.log('\n8. Text Line Analysis (checking for copyright):');
  
  for (let line = 20; line < 24; line++) {
    const y = line * 8;
    let lineContent = '';
    for (let xByte = 0; xByte < 32; xByte++) {
      const y0 = y & 0x07;
      const y1 = (y & 0x38) >> 3;
      const y2 = (y & 0xC0) >> 6;
      const bitmapAddr = (y0 << 8) | (y1 << 5) | (y2 << 11) | xByte;
      const byte = bitmap[bitmapAddr];
      lineContent += byte !== 0 ? '#' : '.';
    }
    console.log(`   Line ${line}: ${lineContent}`);
  }

  // Step 8: Port writes analysis
  console.log('\n9. Port Write Analysis:');
  console.log(`   - Total port writes to 0xFE: ${portWrites.length}`);
  if (portWrites.length > 0) {
    const borderChanges = portWrites.filter((p, i, arr) => 
      i === 0 || (p.value & 0x07) !== (arr[i-1].value & 0x07)
    );
    console.log(`   - Border color changes: ${borderChanges.length}`);
    console.log(`   - Final border color: ${ula.border}`);
  }

  // Step 9: PC history analysis
  console.log('\n10. PC History Analysis:');
  const uniquePCs = [...new Set(pcHistory)];
  console.log(`   - Unique PCs visited: ${uniquePCs.length}`);
  
  // Check if PC is stuck in a loop
  if (pcHistory.length >= 100) {
    const last100 = pcHistory.slice(-100);
    const uniqueLast100 = [...new Set(last100)];
    console.log(`   - Unique PCs in last 100: ${uniqueLast100.length}`);
    
    if (uniqueLast100.length < 10) {
      console.log(`   - WARNING: PC appears stuck in a small loop!`);
      console.log(`   - Loop addresses: ${uniqueLast100.map(pc => '0x' + pc.toString(16).padStart(4, '0')).join(', ')}`);
    }
  }
  
  // Step 10: Final summary
  console.log('\n=== SUMMARY ===');
  console.log(`ROM loaded correctly: ${romStartCorrect ? 'YES' : 'NO'}`);
  console.log(`Memory reads work: ${memory.read(0x0000) === 0xF3 ? 'YES' : 'NO'}`);
  console.log(`EI executed: ${eiExecuted ? 'YES' : 'NO'}`);
  console.log(`Reached copyright routine: ${reachedCopyrightRoutine ? 'YES' : 'NO'}`);
  console.log(`Non-zero pixels: ${nonZeroPixels}`);
  console.log(`Default attributes: ${defaultAttrs}/768`);
  console.log(`Final border: ${ula.border}`);
  
  if (nonZeroPixels > 100 && defaultAttrs === 768) {
    console.log('\n✅ Boot sequence appears SUCCESSFUL!');
  } else if (nonZeroPixels === 0) {
    console.log('\n❌ No pixels written - boot did NOT complete');
  } else {
    console.log('\n⚠️ Partial boot - some pixels but attributes may be wrong');
  }
}

runTest().catch(console.error);
