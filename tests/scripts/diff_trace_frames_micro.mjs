#!/usr/bin/env node
// Diff micro arrays for a given frame between two saved trace JSON files.
// Usage: node tests/scripts/diff_trace_frames_micro.mjs <traceA.json> <traceB.json> [frameIndex]

import fs from 'fs';
import path from 'path';

const aPath = process.argv[2];
const bPath = process.argv[3];
const frameIndex = Number(process.argv[4] || 0);
if (!aPath || !bPath) {
  console.error('Usage: node diff_trace_frames_micro.mjs <traceA.json> <traceB.json> [frameIndex]');
  process.exit(2);
}

function normalize(e) {
  if (e == null) return null;
  const copy = Object.assign({}, e);
  delete copy.t; // time can legitimately differ
  // canonicalize numeric props
  if (typeof copy.pc === 'number') copy.pc = copy.pc & 0xffff;
  if (typeof copy.target === 'number') copy.target = copy.target & 0xffff;
  if (typeof copy.addr === 'number') copy.addr = copy.addr & 0xffff;
  if (Array.isArray(copy.bytes)) copy.bytes = copy.bytes.slice(0, 8);
  return copy;
}

function firstMismatch(a, b) {
  const la = Array.isArray(a) ? a : [];
  const lb = Array.isArray(b) ? b : [];
  const L = Math.max(la.length, lb.length);
  for (let i = 0; i < L; i++) {
    const ea = la[i] ? JSON.stringify(normalize(la[i])) : null;
    const eb = lb[i] ? JSON.stringify(normalize(lb[i])) : null;
    if (ea !== eb) return { idx: i, a: la[i] || null, b: lb[i] || null };
  }
  return { idx: -1, a: null, b: null };
}

function readTrace(p) {
  const data = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse JSON from', p, err && err.message);
    process.exit(3);
  }
}

const ta = readTrace(aPath);
const tb = readTrace(bPath);

const fa = Array.isArray(ta.frames) && ta.frames[frameIndex] ? ta.frames[frameIndex] : null;
const fb = Array.isArray(tb.frames) && tb.frames[frameIndex] ? tb.frames[frameIndex] : null;

if (!fa || !fb) {
  console.error('One of the traces does not contain frame', frameIndex);
  process.exit(4);
}

const ma = fa.micro || [];
const mb = fb.micro || [];
console.log('Frame', frameIndex, 'micro lengths ->', ma.length, mb.length);
const mismatch = firstMismatch(ma, mb);
if (mismatch.idx === -1) {
  console.log('No mismatch found in micro arrays (first', Math.min(ma.length, mb.length), 'events)');
  process.exit(0);
}

const out = { idx: mismatch.idx, ours: normalize(mismatch.a), ref: normalize(mismatch.b), context: { oursTail: ma.slice(Math.max(0, mismatch.idx - 8), mismatch.idx + 8), refTail: mb.slice(Math.max(0, mismatch.idx - 8), mismatch.idx + 8) } };
const outPath = path.resolve('traces', `micro_diff_${path.basename(aPath)}_vs_${path.basename(bPath)}_frame${frameIndex}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('First mismatch at index', mismatch.idx);
console.log('Saved diff ->', outPath);
console.log('OURS event:', JSON.stringify(normalize(mismatch.a), null, 2));
console.log('REF  event:', JSON.stringify(normalize(mismatch.b), null, 2));
process.exit(0);
