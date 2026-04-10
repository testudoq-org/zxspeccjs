#!/usr/bin/env node
/* eslint-env node */
/* global fetch, console, process */
/* eslint no-console: 0 */
/* Regenerate traces/parsed_jetpac_snapshot.json from the real Jetpac .z80
   Uses Loader.parseZ80 and writes parsed.snapshot (ram + registers) so
   unit tests that rely on the local parsed snapshot become authoritative.
*/
import fs from 'fs';
import path from 'path';
import { Loader } from '../../src/loader.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

async function main() {
  console.log('[regen] fetching Jetpac .z80 from archive.org');
  const res = await fetch(URL);
  if (!res.ok) throw new Error('Failed to fetch Jetpac .z80: ' + res.status);
  const buf = await res.arrayBuffer();
  console.log('[regen] parsing .z80 with Loader.parseZ80');
  const parsed = Loader.parseZ80(buf);
  if (!parsed || !parsed.snapshot) throw new Error('Loader.parseZ80 returned no snapshot');
  const outPath = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(parsed.snapshot, null, 2));
  console.log('[regen] wrote parsed snapshot to', outPath);
}

main().catch(e => { console.error('[regen] failed:', e && e.message); process.exit(1); });