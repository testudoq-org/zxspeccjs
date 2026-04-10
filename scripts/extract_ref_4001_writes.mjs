#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
import fs from 'fs';

const REF = 'traces/jsspeccy_reference_jetpac_trace.json';
const OUT = 'traces/ref_0x4001_writes.json';

function run() {
  if (!fs.existsSync(REF)) {
    console.error('Reference trace not found:', REF); process.exit(2);
  }
  const trace = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const out = [];
  const frames = trace.frames || [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const writes = (f.memWrites || []).filter(w => w.addr === 0x4001);
    for (const w of writes) out.push({ frame: f.frame != null ? f.frame : i, t: w.t, pc: w.pc, value: w.value });
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT, ' — entries:', out.length);
}

run();
