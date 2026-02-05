/**
 * Check attribute values in video memory after boot
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import * as fs from 'fs';

const romData = fs.readFileSync('./roms/spec48.rom');
const mem = new Memory(new Uint8Array(romData));
const cpu = new Z80(mem);

console.log('Running 300 frames of boot...');

for (let frame = 0; frame < 300; frame++) {
  for (let t = 0; t < 69888; t++) {
    cpu.step();
  }
  if (cpu.iff1) cpu.interrupt();
}

console.log('\n--- CHECKING ATTRIBUTES ---\n');

// Check attributes via getAttributeView()
const attrView = mem.getAttributeView();
const attrValues = new Map();
for (let i = 0; i < 768; i++) {
  const val = attrView[i];
  attrValues.set(val, (attrValues.get(val) || 0) + 1);
}

console.log('Attribute values via getAttributeView():');
for (const [val, count] of attrValues.entries()) {
  console.log(`  0x${val.toString(16).padStart(2, '0')}: ${count} cells`);
}

// Also check raw memory reads
console.log('\nDirect memory reads (0x5800-0x58FF):');
const directValues = new Map();
for (let addr = 0x5800; addr < 0x5B00; addr++) {
  const val = mem.read(addr);
  directValues.set(val, (directValues.get(val) || 0) + 1);
}
for (const [val, count] of directValues.entries()) {
  console.log(`  0x${val.toString(16).padStart(2, '0')}: ${count} cells`);
}

// Check if _flatRam is being synced
console.log('\nChecking _flatRam sync:');
console.log(`  _flatRam[0x1800] (attr 0): 0x${mem._flatRam[0x1800].toString(16).padStart(2, '0')}`);
console.log(`  _flatRam[0x1801] (attr 1): 0x${mem._flatRam[0x1801].toString(16).padStart(2, '0')}`);
console.log(`  mem.read(0x5800): 0x${mem.read(0x5800).toString(16).padStart(2, '0')}`);
console.log(`  mem.read(0x5801): 0x${mem.read(0x5801).toString(16).padStart(2, '0')}`);

// Check system variable ATTR_P (current permanent attributes)
const attrP = mem.read(0x5C8D);
console.log(`\nATTR_P (0x5C8D): 0x${attrP.toString(16).padStart(2, '0')}`);

// Check BORDCR (border color)
const bordcr = mem.read(0x5C48);
console.log(`BORDCR (0x5C48): 0x${bordcr.toString(16).padStart(2, '0')}`);
