#!/usr/bin/env node
/* eslint-env node */
import fs from 'fs';

const OUR = 'traces/jetpac_trace.json';
const OUT = 'traces/our_0x4001_writes.json';

function run() {
  if (!fs.existsSync(OUR)) {
    console.error('Trace not found:', OUR); process.exit(2);
  }
  const trace = JSON.parse(fs.readFileSync(OUR, 'utf8'));
  const out = [];
  const frames = trace.frames || trace;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const writes = (f.memWrites || []).filter(w => w.addr === 0x4001);
    for (const w of writes) out.push({ frame: f.frame != null ? f.frame : i, t: w.t, pc: w.pc, value: w.value });
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT, ' — entries:', out.length);
}

run();
