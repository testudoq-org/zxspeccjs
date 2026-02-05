/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node

/**
 * Debug script to investigate the © symbol issue in the boot screen
 */

import spec48 from './src/roms/spec48.js';

const rom = spec48.bytes;

console.log('=== Investigating © Symbol in ZX Spectrum ROM ===\n');

// The copyright message in the ZX Spectrum ROM is at 0x153B
// It starts with 0x7F (127) which is the © symbol in ZX Spectrum character set
const copyrightAddr = 0x153B;

console.log('1. Copyright message area (0x153B):');
for(let i = copyrightAddr - 5; i < copyrightAddr + 30; i++) {
  const b = rom[i];
  let c;
  if (b === 0x7F) {
    c = '©';  // ZX Spectrum character 127 = ©
  } else if (b >= 32 && b < 127) {
    c = String.fromCharCode(b);
  } else if (b >= 0xA0) {
    c = `[token:${b}]`;
  } else {
    c = '.';
  }
  const marker = i === copyrightAddr ? ' <-- START' : '';
  console.log(`  0x${i.toString(16)}: 0x${b.toString(16).padStart(2,'0')} (${b.toString().padStart(3)}) '${c}'${marker}`);
}

// Find where character 127 (©) bitmap is stored
// In ZX Spectrum ROM, character bitmaps start at 0x3D00
const charSetBase = 0x3D00;
const copyrightCharCode = 0x7F; // 127

// Character 127 is relative to character 32 (space)
// So the offset is (127 - 32) * 8 = 760 bytes
const copyrightCharOffset = (copyrightCharCode - 32) * 8;
const copyrightCharAddr = charSetBase + copyrightCharOffset;

console.log('\n2. © character (0x7F = 127) bitmap location:');
console.log(`   Character set base: 0x${charSetBase.toString(16)}`);
console.log(`   Character offset: ${copyrightCharOffset} bytes ((127-32)*8)`);
console.log(`   Bitmap address: 0x${copyrightCharAddr.toString(16)}`);

console.log('\n3. © character bitmap data:');
for (let row = 0; row < 8; row++) {
  const addr = copyrightCharAddr + row;
  const byte = rom[addr];
  const binary = byte.toString(2).padStart(8, '0');
  const visual = binary.replace(/0/g, ' ').replace(/1/g, '█');
  console.log(`   0x${addr.toString(16)}: 0x${byte.toString(16).padStart(2,'0')} ${binary} |${visual}|`);
}

// Look for the system variable CHARS which points to character set - 256
// CHARS is at 0x5C36 in system variables
console.log('\n4. Character rendering info:');
console.log('   In ZX Spectrum, CHARS system variable (0x5C36) points to character set - 256');
console.log('   Default value should be 0x3C00 (points to 0x3D00 - 0x100 = 0x3C00)');
console.log('   ROM sets this during initialization');

// Check if the copyright message starts with 127 (the © character)
console.log('\n5. First byte of copyright message:');
const firstByte = rom[copyrightAddr];
console.log(`   Value: 0x${firstByte.toString(16)} (${firstByte})`);
if (firstByte === 0x7F) {
  console.log('   ✅ This IS the © symbol (character 127)');
} else {
  console.log(`   ❌ Expected 0x7F (127) but got 0x${firstByte.toString(16)} (${firstByte})`);
}

// Check the actual bytes
console.log('\n6. Full copyright message bytes:');
let msgBytes = [];
for (let i = 0; i < 30; i++) {
  const b = rom[copyrightAddr + i];
  if (b === 0 || b >= 0x80 && b !== 0x7F) break;
  msgBytes.push(b);
}
console.log('   Bytes:', msgBytes.map(b => `0x${b.toString(16).padStart(2,'0')}`).join(' '));

// Decode the message
let decoded = '';
for (const b of msgBytes) {
  if (b === 0x7F) {
    decoded += '©';
  } else if (b >= 0x20 && b < 0x7F) {
    decoded += String.fromCharCode(b);
  }
}
console.log('   Decoded:', decoded);

// Check if there might be an issue with character 127 bitmap
console.log('\n7. Check if character 127 bitmap is valid:');
let nonZeroRows = 0;
for (let row = 0; row < 8; row++) {
  if (rom[copyrightCharAddr + row] !== 0) nonZeroRows++;
}
console.log(`   Non-zero rows: ${nonZeroRows}/8`);
if (nonZeroRows === 0) {
  console.log('   ❌ Character bitmap is all zeros - this is the problem!');
} else {
  console.log('   ✅ Character bitmap has data');
}

