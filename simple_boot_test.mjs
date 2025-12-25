#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🔍 ZX Spectrum ROM Boot Sequence Debug Tool');
console.log('===========================================\n');

try {
  // Load ROM data
  const romFileContent = readFileSync('./src/roms/spec48.js', 'utf8');
  console.log('📁 Loaded ROM file, length:', romFileContent.length);
  
  // Parse the export statement
  const match = romFileContent.match(/bytes:\s*new\s+Uint8Array\(\[(.*?)\]\)/s);
  if (!match) {
    throw new Error('Could not find bytes array in ROM file');
  }
  
  // Parse the byte values
  const byteString = match[1];
  const byteValues = byteString.split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
  
  console.log('📊 ROM parsed successfully:');
  console.log('   Bytes count:', byteValues.length);
  console.log('   First 16 bytes:', byteValues.slice(0, 16).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
  
  if (byteValues.length !== 16384) {
    console.log('⚠️  Warning: ROM size is', byteValues.length, 'but should be 16384 bytes');
  }
  
  // Test basic Z80 and Memory classes
  const { Z80 } = await import('./src/z80.mjs');
  const { Memory } = await import('./src/memory.mjs');
  
  console.log('\n🧪 Testing Z80 and Memory initialization...');
  
  // Create memory with ROM
  const memory = new Memory({ romBuffer: byteValues, model: '48k' });
  console.log('✅ Memory initialized');
  
  // Create CPU
  const cpu = new Z80(memory);
  cpu.reset();
  console.log('✅ CPU initialized, PC = 0x' + cpu.PC.toString(16).padStart(4, '0'));
  
  // Test ROM reading
  const firstByte = cpu.readByte(0x0000);
  console.log('📖 ROM byte at 0x0000: 0x' + firstByte.toString(16).padStart(2, '0'));
  
  if (firstByte === 0xF3) {
    console.log('✅ Expected DI instruction found - ROM is valid');
  } else {
    console.log('❌ Expected DI (0xF3) but got 0x' + firstByte.toString(16).padStart(2, '0'));
  }
  
  // Run a few instructions to see if execution works
  console.log('\n🚀 Testing instruction execution...');
  
  for (let i = 0; i < 10; i++) {
    const pc = cpu.PC;
    const opcode = cpu.readByte(pc);
    
    console.log(`📍 Step ${i + 1}: PC=0x${pc.toString(16).padStart(4, '0')}, Opcode=0x${opcode.toString(16).padStart(2, '0')}`);
    
    try {
      const tstates = cpu.step();
      console.log(`   ✅ Executed, ${tstates} tstates, new PC=0x${cpu.PC.toString(16).padStart(4, '0')}`);
    } catch (e) {
      console.log(`   ❌ Execution failed: ${e.message}`);
      break;
    }
    
    if (i >= 5) break; // Don't run too many steps in this basic test
  }
  
  // Check specific boot sequence areas
  console.log('\n🎯 Checking boot sequence areas...');
  
  const bootAreas = {
    'Reset vector': 0x0000,
    'Interrupt handler': 0x0038,
    'Error handler': 0x0055,
    'Copyright area': 0x1530,
    'BASIC prompt': 0x0D6E,
    'Channel streams': 0x163C
  };
  
  Object.entries(bootAreas).forEach(([name, addr]) => {
    const bytes = [];
    for (let i = 0; i < 8; i++) {
      bytes.push(cpu.readByte(addr + i));
    }
    console.log(`   ${name.padEnd(16)}: ${bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
  });
  
  // Look for copyright string
  console.log('\n🔍 Searching for copyright message...');
  let foundCopyright = false;
  for (let addr = 0x1400; addr <= 0x1700 && !foundCopyright; addr++) {
    let text = '';
    for (let i = 0; i < 30 && addr + i < 0xFFFF; i++) {
      const byte = cpu.readByte(addr + i);
      if (byte >= 32 && byte <= 126) {
        text += String.fromCharCode(byte);
      } else {
        if (text.length > 10) break;
        text = '';
      }
    }
    
    if (text.includes('1982') || text.includes('Sinclair')) {
      console.log(`✅ Found copyright text at 0x${addr.toString(16).padStart(4, '0')}: "${text}"`);
      foundCopyright = true;
    }
  }
  
  if (!foundCopyright) {
    console.log('❌ Copyright message not found in expected range');
  }
  
  console.log('\n🏁 Basic boot sequence test completed');
  
} catch (e) {
  console.error('💥 Error:', e.message);
  console.error('Stack trace:', e.stack);
  process.exit(1);
}