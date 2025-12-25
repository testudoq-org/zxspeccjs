#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🔍 Detailed ROM Analysis');
console.log('========================\n');

try {
  // Load ROM
  const romFileContent = readFileSync('./src/roms/spec48.js', 'utf8');
  const match = romFileContent.match(/bytes:\s*new\s+Uint8Array\(\[(.*?)\]\)/s);
  const byteValues = match[1].split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
  
  console.log('📋 Early boot sequence analysis:');
  console.log('   Address | Byte  | Instruction');
  console.log('   --------|-------|-------------');
  
  // Show first 20 bytes with disassembly
  for (let addr = 0; addr < 20; addr++) {
    const byte = byteValues[addr];
    let instruction = 'DB 0x' + byte.toString(16).padStart(2, '0');
    
    // Simple disassembly for key instructions
    switch (byte) {
      case 0xF3: instruction = 'DI'; break;
      case 0xAF: instruction = 'XOR A'; break;
      case 0x11: 
        if (addr + 2 < byteValues.length) {
          const nn = (byteValues[addr + 2] << 8) | byteValues[addr + 1];
          instruction = `LD DE,0x${nn.toString(16).padStart(4, '0')}`;
        }
        break;
      case 0xC3:
        if (addr + 2 < byteValues.length) {
          const nn = (byteValues[addr + 2] << 8) | byteValues[addr + 1];
          instruction = `JP 0x${nn.toString(16).padStart(4, '0')}`;
        }
        break;
    }
    
    console.log(`   0x${addr.toString(16).padStart(4, '0')} | 0x${byte.toString(16).padStart(2, '0')}   | ${instruction}`);
  }
  
  // Check the jump target
  console.log('\n🎯 Jump target analysis:');
  if (byteValues.length >= 5) {
    const jpAddr = (byteValues[4] << 8) | byteValues[3]; // bytes at 0x0003-0x0004
    console.log(`   JP instruction at 0x0003-0x0004 jumps to: 0x${jpAddr.toString(16).padStart(4, '0')}`);
    
    if (jpAddr === 0x0038) {
      console.log('   ⚠️  BOOT SEQUENCE JUMPS DIRECTLY TO INTERRUPT HANDLER!');
      console.log('   This explains why execution gets stuck in the interrupt area.');
    }
  }
  
  // Show interrupt handler content
  console.log('\n🔧 Interrupt handler (0x0038) analysis:');
  console.log('   Address | Byte  | Instruction');
  console.log('   --------|-------|-------------');
  
  for (let addr = 0x0038; addr < 0x0050 && addr < byteValues.length; addr++) {
    const byte = byteValues[addr];
    let instruction = 'DB 0x' + byte.toString(16).padStart(2, '0');
    
    // Disassemble key interrupt handler instructions
    switch (byte) {
      case 0xF5: instruction = 'PUSH AF'; break;
      case 0xE5: instruction = 'PUSH HL'; break;
      case 0x2A:
        if (addr + 2 < byteValues.length) {
          const nn = (byteValues[addr + 2] << 8) | byteValues[addr + 1];
          instruction = `LD HL,(0x${nn.toString(16).padStart(4, '0')})`;
        }
        break;
      case 0xC9: instruction = 'RET'; break;
      case 0x20:
        const offset = byteValues[addr + 1];
        const signed = (offset & 0x80) ? offset - 0x100 : offset;
        const target = (addr + 2 + signed) & 0xFFFF;
        instruction = `JR NZ,0x${target.toString(16).padStart(4, '0')}`;
        break;
    }
    
    console.log(`   0x${addr.toString(16).padStart(4, '0')} | 0x${byte.toString(16).padStart(2, '0')}   | ${instruction}`);
  }
  
  // Check if there's a RET instruction in the interrupt handler
  console.log('\n🔍 Looking for RET instruction in interrupt handler...');
  let foundRet = false;
  for (let addr = 0x0038; addr < 0x0080 && addr < byteValues.length; addr++) {
    if (byteValues[addr] === 0xC9) { // RET instruction
      console.log(`   ✅ Found RET at 0x${addr.toString(16).padStart(4, '0')}`);
      foundRet = true;
      break;
    }
  }
  
  if (!foundRet) {
    console.log('   ❌ No RET instruction found in early interrupt handler');
    console.log('   This explains why execution gets stuck - no way to return!');
  }
  
  // Look for copyright area
  console.log('\n📺 Copyright display area (0x1530):');
  for (let addr = 0x1530; addr < 0x1540 && addr < byteValues.length; addr++) {
    const byte = byteValues[addr];
    const char = byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
    console.log(`   0x${addr.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} (${char})`);
  }
  
  console.log('\n💡 DIAGNOSIS:');
  console.log('   The boot sequence JUMPS directly to the interrupt handler at 0x0038.');
  console.log('   If the interrupt handler doesn\'t have a proper RET instruction,');
  console.log('   execution will get stuck in a loop within the handler.');
  console.log('');
  console.log('   🔧 SOLUTION: Check if interrupt handler has proper RET instruction');
  console.log('   or implement missing opcode that allows proper exit from handler.');
  
} catch (e) {
  console.error('Error:', e.message);
}