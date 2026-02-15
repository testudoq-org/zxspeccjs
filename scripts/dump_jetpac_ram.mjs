#!/usr/bin/env node
import fs from 'fs';
import { Loader } from '../src/loader.mjs';

function generateJetpacZ80Payload() {
  const PAGE_SIZE = 16384;
  const header = new Uint8Array(30);
  header[0] = 0xFF; header[1] = 0x44; header[6] = 0x00; header[7] = 0x80; // PC=0x8000
  header[10] = 0x3F; header[11] = 0x01; header[27] = 1; header[28] = 1; header[29] = 1;
  const ram = new Uint8Array(3 * PAGE_SIZE);
  for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
  for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
  const code = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x10, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];
  for (let i = 0; i < code.length; i++) ram[0x8000 + i] = code[i];
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0); out.set(ram, header.length);
  return out.buffer;
}

(async function main() {
  const payload = generateJetpacZ80Payload();
  const parsed = Loader.parseZ80(payload);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) {
    console.error('Failed to parse generated Jetpac payload');
    process.exit(2);
  }
  const ram = parsed.snapshot.ram; // 48K linear
  const screen = ram.subarray(0x0000, 0x1800); // 0x4000..0x57FF
  const outPath = './traces/jetpac_ram_0x4000_0x57FF.bin';
  fs.writeFileSync(outPath, Buffer.from(screen));

  const nonZero = Array.from(screen).filter(b => b !== 0).length;
  const thirds = [
    Array.from(screen.subarray(0, 2048)).filter(b => b !== 0).length,
    Array.from(screen.subarray(2048, 4096)).filter(b => b !== 0).length,
    Array.from(screen.subarray(4096, 6144)).filter(b => b !== 0).length,
  ];

  console.log(`Wrote ${screen.length} bytes to ${outPath}`);
  console.log(`Non-zero bytes total: ${nonZero} / ${screen.length}`);
  console.log(`Non-zero per third (top/mid/bottom): ${thirds.join(' / ')}`);
  console.log('First 64 bytes (hex):', Array.from(screen.slice(0,64)).map(b => b.toString(16).padStart(2,'0')).join(' '));
  console.log('Sample middle bytes (offset 0x0800..0x080f):', Array.from(screen.slice(0x0800,0x0810)).map(b => b.toString(16).padStart(2,'0')).join(' '));
  console.log('Sample bottom bytes (offset 0x1000..0x100f):', Array.from(screen.slice(0x1000,0x1010)).map(b => b.toString(16).padStart(2,'0')).join(' '));
})();
