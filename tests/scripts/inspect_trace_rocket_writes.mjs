import fs from 'fs';
const p = 'traces/jetpac_trace.json';
if (!fs.existsSync(p)) { console.error('trace missing'); process.exit(2); }
const t = JSON.parse(fs.readFileSync(p, 'utf8'));
let total = 0;
for (const f of t.frames) {
  const w = (f.memWrites || []).filter(m => m.addr >= 0x4800 && m.addr <= 0x49FF);
  if (w.length) console.log('frame', f.frame, 'count', w.length, 'sample', w.slice(0,6));
  total += w.length;
}
console.log('total rocket-area memWrites:', total);
process.exit(0);
