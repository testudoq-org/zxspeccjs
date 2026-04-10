#!/usr/bin/env node
/* eslint-env node */
/* global fetch, console, process */
/* eslint no-console: 0 */
import { Loader } from '../../src/loader.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error('fetch failed ' + res.status);
  const buf = await res.arrayBuffer();
  const parsed = Loader.parseZ80(buf);
  console.log('parsed.snapshot.registers.PC =', parsed.snapshot.registers && parsed.snapshot.registers.PC);
  const ram = parsed.snapshot.ram || new Uint8Array(49152);
  const off = 0x8398 - 0x4000; // expected ram offset for PC 0x8398
  const slice = Array.from(ram.slice(off, off + 16)).map(b => b.toString(16).padStart(2, '0'));
  console.log('ram[@0x' + off.toString(16) + '] sample =', slice);
}

main().catch(e => { console.error(e); process.exit(1); });