#!/usr/bin/env node
// Compare two emulator traces (our trace vs reference) and highlight differences
import fs from 'fs';
import path from 'path';

function loadTrace(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return data;
}

function summarizeFrame(frame) {
  return {
    frame: frame.frame,
    PC: frame.regs.PC,
    R: frame.regs.R,
    memWrites: frame.memWrites ? frame.memWrites.length : 0,
    portWrites: frame.portWrites ? frame.portWrites.length : 0,
  };
}

function compare(trA, trB) {
  const frames = Math.min(trA.frames.length, trB.frames.length);
  const diffs = [];
  for (let i = 0; i < frames; i++) {
    const a = summarizeFrame(trA.frames[i]);
    const b = summarizeFrame(trB.frames[i]);
    const d = {};
    if (a.PC !== b.PC) d.PC = { a: a.PC, b: b.PC };
    if (a.R !== b.R) d.R = { a: a.R, b: b.R };
    if (a.memWrites !== b.memWrites) d.memWrites = { a: a.memWrites, b: b.memWrites };
    if (a.portWrites !== b.portWrites) d.portWrites = { a: a.portWrites, b: b.portWrites };
    if (Object.keys(d).length) diffs.push({ frame: i, diff: d, a, b });
  }
  return diffs;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: compare_traces.mjs <traceA.json> <traceB.json>');
    process.exit(1);
  }
  const [aPath, bPath] = args;
  const trA = loadTrace(aPath);
  const trB = loadTrace(bPath);
  console.log(`Loaded ${aPath}: ${trA.frames.length} frames`);
  console.log(`Loaded ${bPath}: ${trB.frames.length} frames`);

  const diffs = compare(trA, trB);
  if (diffs.length === 0) {
    console.log('No differences found (on compared frames).');
    return;
  }

  console.log(`Found ${diffs.length} frames with differences:`);
  for (const d of diffs.slice(0, 100)) {
    console.log(`Frame ${d.frame}:`, JSON.stringify(d.diff));
  }
  if (diffs.length > 100) console.log(`...${diffs.length - 100} more frames omitted`);
}

main().catch(e => { console.error('Compare failed', e); process.exit(1); });