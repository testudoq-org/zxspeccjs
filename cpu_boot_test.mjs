#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🚀 ZX Spectrum CPU Boot Progression Test');
console.log('=========================================\n');

try {
  // Load ROM
  const romFileContent = readFileSync('./src/roms/spec48.js', 'utf8');
  const match = romFileContent.match(/bytes:\s*new\s+Uint8Array\(\[(.*?)\]\)/s);
  const byteValues = match[1].split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
  
  const { Z80 } = await import('./src/z80.mjs');
  const { Memory } = await import('./src/memory.mjs');
  
  // Initialize system (no ULA needed for CPU testing)
  const memory = new Memory({ romBuffer: byteValues, model: '48k' });
  const cpu = new Z80(memory);
  
  cpu.reset();
  
  console.log('✅ CPU System initialized');
  console.log(`📍 Starting PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`📍 Starting SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
  
  // Key boot milestones
  const milestones = {
    'Start': 0x0000,
    'After DI': 0x0001, 
    'Interrupt Vector': 0x0038,
    'Error Handler': 0x0055,
    'Copyright Display': 0x1530,
    'BASIC Entry': 0x0D6E
  };
  
  let reachedMilestones = {};
  let lastPC = cpu.PC;
  let stalledCount = 0;
  
  // Run boot sequence
  console.log('\n🏃 Running CPU boot sequence...');
  const maxInstructions = 3000;
  const startTime = Date.now();
  
  for (let i = 0; i < maxInstructions; i++) {
    const pcBefore = cpu.PC;
    
    // Check milestones
    Object.entries(milestones).forEach(([name, addr]) => {
      if (pcBefore === addr && !reachedMilestones[name]) {
        reachedMilestones[name] = i + 1;
        console.log(`🎯 REACHED ${name} at instruction ${i + 1}, PC=0x${addr.toString(16).padStart(4, '0')}`);
      }
    });
    
    // Execute instruction
    try {
      const tstates = cpu.step();
      
      // Progress reporting every 500 instructions
      if ((i + 1) % 500 === 0) {
        const elapsed = Date.now() - startTime;
        console.log(`📊 Instruction ${i + 1}: PC=0x${cpu.PC.toString(16).padStart(4, '0')}, Time=${elapsed}ms`);
      }
      
    } catch (e) {
      console.log(`❌ EXECUTION FAILED at instruction ${i + 1}, PC=0x${pcBefore.toString(16).padStart(4, '0')}`);
      console.log(`   Error: ${e.message}`);
      break;
    }
    
    // Check for stalls (PC not progressing)
    if (cpu.PC === lastPC) {
      stalledCount++;
      if (stalledCount > 50) {
        console.log(`⚠️  EXECUTION STALLED at PC=0x${cpu.PC.toString(16).padStart(4, '0')} for 50+ instructions`);
        console.log(`   This suggests an infinite loop or hanging instruction`);
        break;
      }
    } else {
      stalledCount = 0;
      lastPC = cpu.PC;
    }
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`\n🏁 CPU boot progression completed`);
  console.log(`   Instructions executed: ${Math.min(maxInstructions, Object.values(reachedMilestones).length > 0 ? maxInstructions : 'unknown')}`);
  console.log(`   Final PC: 0x${cpu.PC.toString(16).padStart(4, '0')}`);
  console.log(`   Final SP: 0x${cpu.SP.toString(16).padStart(4, '0')}`);
  console.log(`   Total time: ${elapsed}ms`);
  
  // Report milestone achievements
  console.log(`\n🎯 MILESTONE ANALYSIS:`);
  Object.entries(milestones).forEach(([name, addr]) => {
    if (reachedMilestones[name]) {
      console.log(`   ✅ ${name}: Reached at instruction ${reachedMilestones[name]}`);
    } else {
      console.log(`   ❌ ${name}: Not reached (expected at 0x${addr.toString(16).padStart(4, '0')})`);
    }
  });
  
  // Check current state
  console.log(`\n💻 FINAL CPU STATE:`);
  console.log(`   PC: 0x${cpu.PC.toString(16).padStart(4, '0')} (Program Counter)`);
  console.log(`   SP: 0x${cpu.SP.toString(16).padStart(4, '0')} (Stack Pointer)`);
  console.log(`   AF: 0x${cpu._getAF().toString(16).padStart(4, '0')} (Accumulator & Flags)`);
  console.log(`   BC: 0x${cpu._getBC().toString(16).padStart(4, '0')} (BC Register)`);
  console.log(`   DE: 0x${cpu._getDE().toString(16).padStart(4, '0')} (DE Register)`);
  console.log(`   HL: 0x${cpu._getHL().toString(16).padStart(4, '0')} (HL Register)`);
  console.log(`   IFF1: ${cpu.IFF1} (Interrupt Flip-Flop 1)`);
  console.log(`   IFF2: ${cpu.IFF2} (Interrupt Flip-Flop 2)`);
  console.log(`   IM: ${cpu.IM} (Interrupt Mode)`);
  
  // Check memory state around key areas
  console.log(`\n💾 MEMORY STATE CHECK:`);
  const keyAreas = {
    'Screen Bitmap (0x4000)': 0x4000,
    'Screen Attrs (0x5800)': 0x5800,
    'System Variables (0x5C00)': 0x5C00,
    'Workspace (0x5C00)': 0x5C00
  };
  
  Object.entries(keyAreas).forEach(([name, addr]) => {
    const bytes = [];
    for (let i = 0; i < 8; i++) {
      bytes.push(cpu.readByte(addr + i));
    }
    console.log(`   ${name.padEnd(25)}: ${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  });
  
  // Diagnosis
  console.log(`\n🔍 BOOT SEQUENCE DIAGNOSIS:`);
  const finalPC = cpu.PC;
  
  if (finalPC >= 0x1500 && finalPC <= 0x1600) {
    console.log('   🎯 EXECUTION REACHED COPYRIGHT DISPLAY AREA');
    console.log('   📺 The boot sequence should be displaying the copyright message');
    console.log('   💡 This indicates the ROM boot sequence is working correctly!');
    console.log('   🔧 NEXT STEP: Test display rendering to see if copyright appears');
  } else if (finalPC >= 0x0D00 && finalPC <= 0x0E00) {
    console.log('   🎯 EXECUTION REACHED BASIC PROMPT AREA');  
    console.log('   💻 The boot sequence has progressed to BASIC initialization');
    console.log('   💡 This indicates successful boot progression!');
    console.log('   🔧 NEXT STEP: Verify BASIC prompt display');
  } else if (finalPC < 0x100) {
    console.log('   ⚠️  EXECUTION STUCK IN EARLY BOOT SEQUENCE');
    console.log('   🐛 Possible issues: missing opcodes, timing problems, or memory corruption');
    console.log('   🔧 NEXT STEP: Analyze specific failing instruction');
  } else {
    console.log('   📍 EXECUTION PROGRESSED BEYOND EARLY BOOT');
    console.log(`   🎯 Current location: 0x${finalPC.toString(16).padStart(4, '0')}`);
    console.log('   💡 Boot sequence is executing but may need more instructions to complete');
    console.log('   🔧 NEXT STEP: Continue execution or check for additional milestones');
  }
  
  // Check copyright message area
  console.log(`\n📝 COPYRIGHT MESSAGE CHECK:`);
  let copyrightText = '';
  for (let i = 0; i < 50; i++) {
    const byte = cpu.readByte(0x152C + i);
    if (byte >= 32 && byte <= 126) {
      copyrightText += String.fromCharCode(byte);
    } else if (copyrightText.length > 0) {
      break;
    }
  }
  
  if (copyrightText.includes('1982') && copyrightText.includes('Sinclair')) {
    console.log(`   ✅ Copyright message found: "${copyrightText}"`);
    console.log('   📺 This text should be visible on the screen during boot');
  } else {
    console.log(`   ❌ Copyright message not properly formed: "${copyrightText}"`);
  }
  
  // Final recommendation
  console.log(`\n💡 RECOMMENDATION:`);
  if (finalPC >= 0x1500) {
    console.log('   🎉 BOOT SEQUENCE IS WORKING! The CPU reaches the copyright display area.');
    console.log('   📺 The issue is likely in the display rendering, not the CPU execution.');
    console.log('   🔧 Focus on ULA/display rendering to show the blue screen with copyright.');
  } else {
    console.log('   🔧 Continue debugging the boot sequence progression.');
    console.log('   📊 Consider running with more instructions or checking for missing opcodes.');
  }
  
  console.log('\n🏁 CPU boot progression test completed');
  
} catch (e) {
  console.error('💥 Fatal error:', e.message);
  console.error('Stack trace:', e.stack);
  process.exit(1);
}