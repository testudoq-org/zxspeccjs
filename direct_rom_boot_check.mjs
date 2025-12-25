#!/usr/bin/env node

/**
 * Direct test of ROM boot sequence to check if copyright message is generated
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';
import spec48 from './src/roms/spec48.js';

console.log('🎯 Direct ROM Boot Sequence Test');
console.log('=================================');

async function testDirectBoot() {
  try {
    console.log('Loading ROM...');
    const memory = new Memory(spec48.bytes);
    const cpu = new Z80(memory);
    
    console.log('✅ Memory and CPU initialized with ROM');
    console.log('ROM first 10 bytes:', Array.from(spec48.bytes.slice(0, 10).map(b => `0x${b.toString(16).padStart(2, '0')}`)));
    
    // Reset CPU to start boot sequence
    cpu.reset();
    console.log('CPU reset - starting at PC:', `0x${cpu.PC.toString(16)}`);
    
    // Check initial memory state
    console.log('\n=== Initial Memory State ===');
    let initialDisplaySum = 0;
    for (let addr = 0x4000; addr < 0x4100; addr++) {
      initialDisplaySum += memory.read(addr);
    }
    console.log(`Initial display memory sum (first 256 bytes): ${initialDisplaySum}`);
    
    // Execute boot sequence step by step
    console.log('\n=== Executing Boot Sequence ===');
    
    let steps = 0;
    const maxSteps = 1000; // Limit to prevent infinite loops
    const displayUpdates = [];
    
    while (steps < maxSteps) {
      const pcBefore = cpu.PC;
      const tstates = cpu.step();
      steps++;
      
      // Check for display updates every 100 steps
      if (steps % 100 === 0) {
        let displaySum = 0;
        for (let addr = 0x4000; addr < 0x4100; addr++) {
          displaySum += memory.read(addr);
        }
        displayUpdates.push({ step: steps, pc: pcBefore, displaySum });
        console.log(`Step ${steps}: PC=0x${pcBefore.toString(16)}, Display sum=${displaySum}, T-states=${tstates}`);
      }
      
      // Check if we reached the copyright display routine (around 0x0D6E in real ROM)
      if (cpu.PC === 0x0D6E || cpu.PC === 0x0D70) {
        console.log(`🎯 Reached copyright display routine at PC 0x${cpu.PC.toString(16)}`);
        break;
      }
      
      // Stop if PC doesn't advance (infinite loop or halt)
      if (cpu.PC === pcBefore) {
        console.log(`⚠️  PC not advancing at step ${steps}, stopping`);
        break;
      }
    }
    
    console.log(`\nBoot sequence executed for ${steps} steps`);
    console.log(`Final PC: 0x${cpu.PC.toString(16)}`);
    
    // Check final memory state
    console.log('\n=== Final Memory State ===');
    
    let finalDisplaySum = 0;
    let displayBytes = [];
    for (let addr = 0x4000; addr < 0x4100; addr++) {
      const value = memory.read(addr);
      finalDisplaySum += value;
      if (value !== 0) {
        displayBytes.push({ addr, value, char: value >= 32 && value <= 126 ? String.fromCharCode(value) : `\\x${value.toString(16)}` });
      }
    }
    
    console.log(`Final display memory sum: ${finalDisplaySum}`);
    console.log(`Non-zero display bytes: ${displayBytes.length}`);
    
    if (displayBytes.length > 0) {
      console.log('Display content:');
      displayBytes.slice(0, 20).forEach(({ addr, value, char }) => {
        console.log(`  0x${addr.toString(16)}: 0x${value.toString(16)} (${char})`);
      });
      
      // Check for copyright message
      const displayText = displayBytes.map(b => b.char.replace(/\\x[0-9a-f]+/, '?')).join('');
      console.log(`Display text: "${displayText}"`);
      
      if (displayText.includes('Sinclair') || displayText.includes('RESEARCH') || displayText.includes('Ltd')) {
        console.log('✅ FOUND copyright message content!');
      } else {
        console.log('❌ Copyright message not found');
        
        // Check what we actually have
        const asciiText = displayBytes
          .filter(b => b.value >= 32 && b.value <= 126)
          .map(b => String.fromCharCode(b.value))
          .join('');
        console.log(`ASCII content only: "${asciiText}"`);
      }
    } else {
      console.log('❌ No content in display memory');
    }
    
    // Check attribute memory
    console.log('\n=== Attribute Memory Check ===');
    let attrSum = 0;
    let attrNonZero = 0;
    for (let addr = 0x5800; addr < 0x5900; addr++) {
      const value = memory.read(addr);
      attrSum += value;
      if (value !== 0) attrNonZero++;
    }
    console.log(`Attribute memory: ${attrNonZero} non-zero bytes, sum: ${attrSum}`);
    
    if (attrNonZero > 0) {
      console.log('Attributes found - checking values...');
      for (let addr = 0x5800; addr < 0x5810; addr++) {
        const value = memory.read(addr);
        if (value !== 0) {
          const ink = value & 0x07;
          const paper = (value >> 3) & 0x07;
          console.log(`  0x${addr.toString(16)}: 0x${value.toString(16)} (INK:${ink} PAPER:${paper})`);
        }
      }
    }
    
    // Final assessment
    console.log('\n🎯 FINAL ASSESSMENT:');
    console.log('====================');
    
    const displayChanged = finalDisplaySum > initialDisplaySum;
    const hasDisplayContent = displayBytes.length > 0;
    const hasAttributes = attrNonZero > 0;
    
    console.log(`Display memory changed: ${displayChanged ? '✅ YES' : '❌ NO'}`);
    console.log(`Display has content: ${hasDisplayContent ? '✅ YES' : '❌ NO'}`);
    console.log(`Attributes initialized: ${hasAttributes ? '✅ YES' : '❌ NO'}`);
    
    if (displayChanged && hasDisplayContent) {
      console.log('\n✅ ROM boot sequence IS writing to display memory');
      console.log('💡 If copyright text is not visible, the issue is likely:');
      console.log('   1. Browser canvas rendering');
      console.log('   2. Character set/font mapping');
      console.log('   3. Color/palette issues');
      console.log('   4. Canvas scaling or CSS issues');
    } else {
      console.log('\n❌ ROM boot sequence is NOT writing to display memory');
      console.log('💡 Possible issues:');
      console.log('   1. ROM not loaded correctly');
      console.log('   2. Boot sequence incomplete or stuck');
      console.log('   3. Missing ROM routines for screen output');
    }
    
    // Show execution progression
    console.log('\n📈 Execution Progression:');
    displayUpdates.forEach(update => {
      console.log(`Step ${update.step}: PC 0x${update.pc.toString(16)}, Display sum: ${update.displaySum}`);
    });
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error(error.stack);
  }
}

testDirectBoot().then(() => {
  console.log('\n🏁 Test completed');
}).catch(error => {
  console.error('Test failed:', error);
});