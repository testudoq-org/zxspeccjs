#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Create a synthetic "reference" trace that mirrors the temporary JSSpeccy shim
// The shim emits per-frame events (2 memWrites, 1 portWrite, 1 regsSnapshot)
// This generator reads our real `jetpac_trace.json` and produces a
// `jsspeccy_reference_jetpac_trace.json` with the same frame/time layout but
// with shim-style mem/port events so we can run a per-event comparison quickly.

const ROOT = process.cwd();
const inFile = path.join(ROOT, 'traces', 'jetpac_trace.json');
const outFile = path.join(ROOT, 'traces', 'jsspeccy_reference_jetpac_trace.json');

function makeShimFrame(frame) {
  // shim timing relative offsets (from experiment in instrumented.html)
  const base = frame.startT || (frame.frame * (frame.tstates || 69888));
  const mem1T = base + 65560;
  const mem2T = base + 65562;
  const portT = base + 65577;
  const regsT = base + 65580;

  // Prefer to reuse actual mem/port values from the input trace when present
  const srcMemWrites = (frame.memWrites || []).reduce((m, e) => { m[e.addr] = e; return m; }, {});
  const v4000 = srcMemWrites[16384] ? srcMemWrites[16384].value : 0xAA;
  const v4001 = srcMemWrites[16385] ? srcMemWrites[16385].value : v4000;

  // Port: prefer an existing low-byte value from the frame, else mirror A (0xAA)
  const srcPort = (frame.portWrites && frame.portWrites.length > 0) ? frame.portWrites[0].value & 0xFF : v4000;

  return {
    frame: frame.frame,
    startT: frame.startT,
    tstates: frame.tstates,
    regs: frame.regs, // reuse regs so PC/R remain comparable
    memWrites: [
      { type: 'write', addr: 16384, value: v4000, t: mem1T },
      { type: 'write', addr: 16385, value: v4001, t: mem2T }
    ],
    portWrites: [
      { port: 0x00FE, value: srcPort, tstates: portT }
    ],
    micro: [],
    toggles: []
  };
}

function main() {
  if (!fs.existsSync(inFile)) {
    console.error('Input trace not found:', inFile);
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const frames = (src.frames || []).map(f => makeShimFrame(f));
  const out = { meta: { frames: frames.length }, frames };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log('Wrote synthetic shim reference trace to', outFile);
}

main();