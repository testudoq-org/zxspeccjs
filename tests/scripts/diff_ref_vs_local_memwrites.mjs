#!/usr/bin/env node
import fs from 'fs';

const refPath = 'traces/jsspeccy_reference_jetpac_trace.json';
const locPath = 'traces/jetpac_trace_local.json';
const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
const loc = JSON.parse(fs.readFileSync(locPath, 'utf8'));
const ra = (ref.frames && ref.frames[0] && ref.frames[0].memWrites) || [];
const lb = (loc.frames && loc.frames[0] && loc.frames[0].memWrites) || [];
console.log('ref.len', ra.length, 'local.len', lb.length);
const L = Math.max(ra.length, lb.length);
for (let i = 0; i < L; i++) {
  const r = ra[i] || null;
  const l = lb[i] || null;
  const rkey = r ? `${r.addr}@${r.t}#${r.value}` : null;
  const lkey = l ? `${l.addr}@${l.t}#${l.value}` : null;
  if (rkey !== lkey) {
    console.log('first mismatch index', i);
    console.log('ref:', r);
    console.log('local:', l);
    process.exit(0);
  }
}
console.log('no differences found');
