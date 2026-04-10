#!/usr/bin/env node
// Find the first microLog mismatch between two saved trace files across frames
// Usage: node find_first_micro_mismatch_between_traces.mjs <traceA.json> <traceB.json>
import fs from 'fs';
const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) { console.error('Usage: node find_first_micro_mismatch_between_traces.mjs <traceA.json> <traceB.json>'); process.exit(2); }
const A = JSON.parse(fs.readFileSync(aPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(bPath, 'utf8'));
const fa = Array.isArray(A.frames) ? A.frames : [];
const fb = Array.isArray(B.frames) ? B.frames : [];
const F = Math.max(fa.length, fb.length);
function normalize(e){ if(!e) return null; const c={...e}; delete c.t; if(typeof c.pc==='number') c.pc=c.pc&0xffff; if(typeof c.target==='number') c.target=c.target&0xffff; if(typeof c.addr==='number') c.addr=c.addr&0xffff; if(Array.isArray(c.bytes)) c.bytes=c.bytes.slice(0,8); return c; }
for(let f=0; f<F; f++){
  const ma = (fa[f] && fa[f].micro) || [];
  const mb = (fb[f] && fb[f].micro) || [];
  const L = Math.max(ma.length, mb.length);
  for (let i=0;i<L;i++){
    const na = ma[i] ? JSON.stringify(normalize(ma[i])) : null;
    const nb = mb[i] ? JSON.stringify(normalize(mb[i])) : null;
    if (na !== nb) {
      console.log('First mismatch frame', f, 'microIndex', i);
      console.log('OURS:', ma[i]);
      console.log('REF :', mb[i]);
      process.exit(0);
    }
  }
}
console.log('No micro mismatch across frames');
