#!/usr/bin/env node
import { readFileSync } from 'fs';

console.log('🔍 Memory Mapping Diagnostic');
console.log('=============================\n');

try {
  // Load ROM data
  const romFileContent = readFileSync('./src/roms/spec48.js', 'utf8');
  const match = romFileContent.match(/bytes:\s*new\s+Uint8Array\(\[(.*?)\]\)/s);
  const byteValues = match[1].split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
  
  const { Memory } = await import('./src/memory.mjs');
  
  console.log('🔧 Testing memory initialization with different configurations...');
  
  // Test 1: Check if ROM is being loaded into romBanks
  console.log('\n📋 Test 1: ROM Loading');
  const memory1 = new Memory({ romBuffer: byteValues, model: '48k' });
  
  console.log('   ROM banks count:', memory1.romBanks.length);
  console.log('   ROM bank 0 size:', memory1.romBanks[0] ? memory1.romBanks[0].length : 'undefined');
  console.log('   First ROM byte:', memory1.romBanks[0] ? memory1.romBanks[0][0] : 'N/A');
  console.log('   Current ROM index:', memory1.currentRom);
  
  // Test 2: Check page mapping
  console.log('\n📋 Test 2: Page Mapping');
  console.log('   Page 0 (0x0000-0x3FFF):', memory1.pages[0] ? 'mapped' : 'unmapped');
  console.log('   Page 1 (0x4000-0x7FFF):', memory1.pages[1] ? 'mapped' : 'unmapped');
  console.log('   Page 2 (0x8000-0xBFFF):', memory1.pages[2] ? 'mapped' : 'unmapped');
  console.log('   Page 3 (0xC000-0xFFFF):', memory1.pages[3] ? 'mapped' : 'unmapped');
  
  // Test 3: Direct memory access
  console.log('\n📋 Test 3: Direct Memory Access');
  console.log('   Reading 0x0000 via memory.read():', memory1.read(0x0000));
  console.log('   Reading 0x0000 via page[0]:', memory1.pages[0] ? memory1.pages[0][0] : 'N/A');
  
  // Test 4: Force ROM mapping
  console.log('\n📋 Test 4: Force ROM Mapping');
  memory1.mapROM(0);
  console.log('   After mapROM(0), page 0:', memory1.pages[0] ? 'mapped' : 'unmapped');
  console.log('   Reading 0x0000 after remap:', memory1.read(0x0000));
  
  // Test 5: Check if ROM bank includes our data
  if (memory1.romBanks[0]) {
    console.log('\n📋 Test 5: ROM Bank Content Verification');
    console.log('   ROM bank first 16 bytes:', 
      Array.from(memory1.romBanks[0].slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    
    if (memory1.romBanks[0][0] === 0xF3) {
      console.log('   ✅ ROM bank contains expected DI instruction');
    } else {
      console.log('   ❌ ROM bank does not contain expected DI instruction');
      console.log('   Expected: 0xF3, Got:', '0x' + memory1.romBanks[0][0].toString(16).padStart(2, '0'));
    }
  }
  
  // Test 6: Compare ROM bytes with file
  console.log('\n📋 Test 6: File vs Memory Comparison');
  console.log('   File byte 0:', '0x' + byteValues[0].toString(16).padStart(2, '0'));
  console.log('   ROM bank byte 0:', memory1.romBanks[0] ? '0x' + memory1.romBanks[0][0].toString(16).padStart(2, '0') : 'N/A');
  console.log('   Memory read byte 0:', '0x' + memory1.read(0x0000).toString(16).padStart(2, '0'));
  
  // Test 7: Alternative initialization
  console.log('\n📋 Test 7: Alternative Memory Initialization');
  const memory2 = new Memory({ model: '48k' });
  memory2.loadROM(byteValues, 0);
  console.log('   After loadROM(), page 0:', memory2.pages[0] ? 'mapped' : 'unmapped');
  console.log('   Reading 0x0000:', memory2.read(0x0000));
  
  console.log('\n🏁 Memory mapping diagnostic completed');
  
} catch (e) {
  console.error('💥 Error:', e.message);
  console.error('Stack trace:', e.stack);
  process.exit(1);
}