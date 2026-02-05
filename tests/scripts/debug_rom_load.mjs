/**
 * Debug the Memory ROM loading process
 */

import { Memory } from './src/memory.mjs';
import * as fs from 'fs';

console.log('=== ROM Loading Debug ===\n');

// Load ROM file
const romData = fs.readFileSync('./roms/spec48.rom');
console.log('ROM file loaded, size:', romData.length);
console.log('ROM file first 10 bytes:', Array.from(romData.slice(0, 10)));

// Create Uint8Array from ROM
const romUint8 = new Uint8Array(romData);
console.log('\nUint8Array created, size:', romUint8.length);
console.log('Uint8Array first 10 bytes:', Array.from(romUint8.slice(0, 10)));

// Now create Memory with this ROM
console.log('\n--- Creating Memory with ROM ---');
const mem = new Memory({ romBuffer: romUint8 });

// Check if ROM is loaded correctly
console.log('\n--- Checking Memory.read() ---');
console.log('mem.read(0x0000):', mem.read(0x0000).toString(16));
console.log('mem.read(0x0001):', mem.read(0x0001).toString(16));
console.log('mem.read(0x0038):', mem.read(0x0038).toString(16));

console.log('\n--- Checking pages[0] directly ---');
console.log('pages[0][0]:', mem.pages[0][0].toString(16));
console.log('pages[0][1]:', mem.pages[0][1].toString(16));
console.log('pages[0][0x38]:', mem.pages[0][0x38].toString(16));

console.log('\n--- Checking romBanks[0] directly ---');
if (mem.romBanks[0]) {
  console.log('romBanks[0][0]:', mem.romBanks[0][0].toString(16));
  console.log('romBanks[0][0x38]:', mem.romBanks[0][0x38].toString(16));
} else {
  console.log('romBanks[0] is undefined!');
}

// Check if pages[0] is the same object as romBanks[0]
console.log('\n--- Identity check ---');
console.log('pages[0] === romBanks[0]:', mem.pages[0] === mem.romBanks[0]);
