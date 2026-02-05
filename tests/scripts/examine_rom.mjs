/* eslint-disable no-console, no-undef, no-unused-vars */
// Simple ROM examination script
import spec48 from './src/roms/spec48.js';

console.log('🔍 ROM Data Examination');
console.log('='.repeat(50));

// Get ROM bytes
const romBytes = spec48.bytes;
console.log(`ROM size: ${romBytes.length} bytes`);

// Check the problematic address
const addr = 0x11CB;
console.log(`\n🎯 Address 0x${addr.toString(16)}:`);
if (addr < romBytes.length) {
  const value = romBytes[addr];
  console.log(`Value: 0x${value.toString(16).padStart(2, '0')} (${value})`);
  
  // Context around the address
  console.log('\nContext around 0x11CB:');
  const start = Math.max(0, addr - 10);
  const end = Math.min(romBytes.length, addr + 15);
  for (let i = start; i < end; i++) {
    const marker = (i === addr) ? ' 👈 PROBLEMATIC' : '';
    console.log(`0x${i.toString(16).padStart(4, '0')}: 0x${romBytes[i].toString(16).padStart(2, '0')}${marker}`);
  }
} else {
  console.log('Address outside ROM bounds');
}

// Check for ED 2A sequence
console.log('\n🔍 Searching for ED 2A sequence...');
let found = false;
for (let i = 0; i < romBytes.length - 1; i++) {
  if (romBytes[i] === 0xED && romBytes[i + 1] === 0x2A) {
    console.log(`✅ Found ED 2A at address 0x${i.toString(16)}`);
    found = true;
    // Show context
    const contextStart = Math.max(0, i - 5);
    const contextEnd = Math.min(romBytes.length, i + 10);
    console.log('Context:');
    for (let j = contextStart; j < contextEnd; j++) {
      const marker = (j === i) ? ' 👈 ED' : (j === i + 1) ? ' 👈 2A' : '';
      console.log(`  0x${j.toString(16).padStart(4, '0')}: 0x${romBytes[j].toString(16).padStart(2, '0')}${marker}`);
    }
    break;
  }
}
if (!found) {
  console.log('❌ ED 2A sequence not found in ROM');
}

// Check boot sequence
console.log('\n🔍 Boot sequence (first 20 bytes):');
for (let i = 0; i < Math.min(20, romBytes.length); i++) {
  console.log(`0x${i.toString(16).padStart(4, '0')}: 0x${romBytes[i].toString(16).padStart(2, '0')}`);
}

// Test ROM loading by simulating the memory system
console.log('\n🧪 Testing ROM Loading Process...');

// Simulate Memory class behavior
const PAGE_SIZE = 0x4000; // 16KB
const rom = new Uint8Array(PAGE_SIZE);
rom.fill(0xff);
rom.set(romBytes.subarray(0, Math.min(romBytes.length, PAGE_SIZE)));

console.log('✅ ROM loaded into simulated memory');
console.log(`ROM mapped to addresses 0x0000-0x${(PAGE_SIZE-1).toString(16)}`);

// Test reading from the problematic address
const testAddr = 0x11CB;
const page = testAddr >>> 14; // 0 for addresses < 0x4000
const offset = testAddr & (PAGE_SIZE - 1);
const loadedValue = rom[offset];

console.log(`\n📍 Memory read test:`);
console.log(`Address: 0x${testAddr.toString(16)}`);
console.log(`Page: ${page} (should be 0 for ROM)`);
console.log(`Offset: 0x${offset.toString(16)}`);
console.log(`Loaded value: 0x${loadedValue.toString(16).padStart(2, '0')}`);

if (loadedValue === romBytes[testAddr]) {
  console.log('✅ ROM loading test passed');
} else {
  console.log('❌ ROM loading test failed');
}

console.log('\n✅ ROM examination complete');
