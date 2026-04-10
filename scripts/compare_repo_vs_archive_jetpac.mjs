#!/usr/bin/env node
import fs from 'fs';
import { Loader } from '../src/loader.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const localPath = './traces/jetpac_ram_0x4000_0x57FF.bin';

async function main() {
  console.log('Fetching official Jetpac .z80 from Archive.org...');
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) {
    console.error('Archive .z80 parsed but contains no RAM');
    process.exit(2);
  }
  const refRam = parsed.snapshot.ram.subarray(0x0000, 0x1800);
  console.log('Reference RAM length:', refRam.length);

  if (!fs.existsSync(localPath)) {
    console.error('Local dump missing:', localPath);
    process.exit(3);
  }
  const local = fs.readFileSync(localPath);
  if (local.length !== refRam.length) {
    console.error('Length mismatch', local.length, refRam.length);
    process.exit(4);
  }

  let diffs = 0;
  let firstIdx = -1;
  for (let i = 0; i < refRam.length; i++) {
    if (refRam[i] !== local[i]) {
      diffs++;
      if (firstIdx === -1) firstIdx = i;
    }
  }

  if (diffs === 0) {
    console.log('OK — memory dumps are identical (0x4000..0x57FF)');
    process.exit(0);
  }

  console.log(`DIFFER: ${diffs} bytes differ; first mismatch at offset 0x${firstIdx.toString(16)}`);
  const ctx = 16;
  const start = Math.max(0, firstIdx - ctx);
  const end = Math.min(refRam.length, firstIdx + ctx);
  console.log('Reference hex around mismatch:');
  console.log(Array.from(refRam.slice(start,end)).map(b=>b.toString(16).padStart(2,'0')).join(' '));
  console.log('Local hex around mismatch:');
  console.log(Array.from(local.slice(start,end)).map(b=>b.toString(16).padStart(2,'0')).join(' '));
  process.exit(5);
}

main().catch(e => { console.error(e); process.exit(1); });