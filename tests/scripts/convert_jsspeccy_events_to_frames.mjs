#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const IN = path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.json');
const OUT = path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.frames.json');
const TPF = 69888;

if (!fs.existsSync(IN)) { console.error('Input not found:', IN); process.exit(1); }
const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
const events = src.events || [];
const FRAMES = (src.meta && src.meta.frames) || 200;

// Initialize empty frames
const frames = new Array(FRAMES).fill(0).map((_, i) => ({ frame: i, startT: i * TPF, tstates: (i + 1) * TPF, regs: null, memWrites: [], portWrites: [], micro: [], toggles: [], contentionLog: [], contentionHits: 0 }));

for (const ev of events) {
  const t = ev.t || ev.tstates || 0;
  const frameIdx = Math.floor(t / TPF);
  if (frameIdx < 0 || frameIdx >= FRAMES) continue;
  const f = frames[frameIdx];
  if (ev.message === 'regsSnapshot') {
    // normalize regsSnapshot into regs object similar to our trace
    if (ev.regs && Array.isArray(ev.regs)) {
      const r = ev.regs;
      f.regs = { A: r[0], F: r[1], B: r[2], C: r[3], D: r[4], E: r[5], H: r[6], L: r[7], PC: r[8], SP: r[9], I: r[10], R: r[11], IFF1: false, IFF2: false, IM: 1 };
    } else if (ev.regs && typeof ev.regs === 'object') {
      f.regs = ev.regs;
    }
  }
  if (ev.message === 'memWrite' || ev.message === 'memwrite' || ev.type === 'write') {
    const addr = ev.addr || ev.a || ev.address || 0;
    const value = ('value' in ev) ? ev.value : (ev.v || 0);
    f.memWrites.push({ type: 'write', addr, value, t: t, pc: ev.pc });
  }
  if (ev.message === 'portWrite' || ev.message === 'portwrite' || ev.type === 'port') {
    const port = ev.port || ev.p || 0;
    const value = ('value' in ev) ? ev.value : (ev.v || 0);
    f.portWrites.push({ port, value, tstates: t, pc: ev.pc });
  }
}

// Backfill regs for frames that didn't get a regsSnapshot using nearest previous
let lastRegs = null;
for (let i = 0; i < frames.length; i++) {
  if (frames[i].regs) lastRegs = frames[i].regs; else frames[i].regs = lastRegs ? { ...lastRegs } : null;
}

const out = { meta: { frames: frames.length }, frames };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('Wrote converted jsspeccy reference frames to', path.relative(process.cwd(), OUT));
