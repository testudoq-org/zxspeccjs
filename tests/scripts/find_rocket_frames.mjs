#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
const TRACE = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
if (!fs.existsSync(TRACE)) { console.error('Trace missing:', TRACE); process.exit(1); }
const t = JSON.parse(fs.readFileSync(TRACE, 'utf8'));
const frames = t.frames || [];
const out = [];
for (const f of frames) {
  const writes = (f.memWrites || []).filter(w => w.addr >= 0x4800 && w.addr < 0x4A00);
  if (writes.length) out.push({ frame: f.frame, startT: f.startT, tstates: f.tstates, writes: writes.slice(0,10) });
}
console.log('Found', out.length, 'frames with rocket-area writes; listing first 10:');
console.log(JSON.stringify(out.slice(0,10), null, 2));
