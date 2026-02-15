#!/usr/bin/env node
/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node */
const console = globalThis.console;
const process = globalThis.process;
/*
  compare_traces_r_contention.mjs
  Small CLI to compare per-frame R-register (low-7 bits) and contention
  timelines between two emulator traces (our trace vs jsspeccy reference).

  Usage:
    node tests/scripts/compare_traces_r_contention.mjs [ourTrace] [refTrace] [frames]

  Defaults:
    ourTrace = traces/jetpac_trace.json
    refTrace = traces/jsspeccy_reference_jetpac_trace.json
    frames   = 10

  Exit code: 0 = all matched (within tolerance), 2 = mismatches found, 1 = error
*/
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const ourPath = argv[0] || path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
const refPath = argv[1] || path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.json');
const framesToCompare = Math.max(1, Math.min(100, parseInt(argv[2] || process.env.TRACE_COMPARE_FRAMES || '10', 10)));
const TOL = 50; // t-state tolerance for "nearby" checks

function load(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

const our = load(ourPath);
const ref = load(refPath);
if (!our) { console.error('ERROR: our trace not found or invalid:', ourPath); process.exit(1); }
if (!ref) { console.error('ERROR: reference trace not found or invalid:', refPath); process.exit(1); }

const totalFrames = Math.min(framesToCompare, our.frames.length || 0, ref.frames.length || 0);
if (totalFrames <= 0) { console.error('No comparable frames found in traces.'); process.exit(1); }

console.log(`Comparing ${totalFrames} frames — our:${path.basename(ourPath)} vs ref:${path.basename(refPath)} (tTol=${TOL})`);
console.log('='.repeat(80));

let mismatch = false;
for (let i = 0; i < totalFrames; i++) {
  const of = our.frames[i] || {};
  const rf = ref.frames[i] || {};
  const ourR = (of.regs && typeof of.regs.R === 'number') ? (of.regs.R & 0x7F) : null;
  const refR = (rf.regs && typeof rf.regs.R === 'number') ? (rf.regs.R & 0x7F) : null;
  const ourCH = of.contentionHits || 0;
  const refCH = rf.contentionHits || 0;

  const ourPort = (of.portWrites || []).find(p => (p.port & 0xFF) === 0xFE) || null;
  const refPort = (rf.portWrites || []).find(p => (p.port & 0xFF) === 0xFE) || null;
  const portT = (refPort && (refPort.tstates || refPort.t)) || (ourPort && (ourPort.tstates || ourPort.t)) || null;

  const ourContLog = of.contentionLog || [];
  const refContLog = rf.contentionLog || [];

  const rMatch = (ourR === null || refR === null) ? 'N/A' : (ourR === refR ? 'OK' : 'DIFF');
  if (rMatch === 'DIFF') mismatch = true;

  // find any contention event near portT in our trace
  const nearby = (portT !== null) ? ourContLog.some(c => Math.abs((c.t || 0) - portT) <= TOL) : false;
  if (!nearby) mismatch = true;

  console.log(`Frame ${i}`);
  console.log(`  R: our=${ourR === null ? '??' : '0x' + ourR.toString(16).padStart(2,'0')} ref=${refR === null ? '??' : '0x' + refR.toString(16).padStart(2,'0')} -> ${rMatch}`);
  console.log(`  contentionHits: our=${ourCH} ref=${refCH}`);
  console.log(`  ULA OUT timing (ref/our): ref=${refPort ? (refPort.tstates || refPort.t) : 'N/A'} our=${ourPort ? (ourPort.tstates || ourPort.t) : 'N/A'}`);

  if (ourContLog.length > 0) {
    const sample = ourContLog.slice(0, 6).map(c => `${c.t || 0}:+${c.extra || 0}/R=${(c.R==null?'?':('0x'+(c.R&0xFF).toString(16)))}`);
    console.log(`  our contention sample: ${sample.join(', ')}`);
  } else {
    console.log('  our contention sample: <none>');
  }

  if (refContLog.length > 0) {
    const sampleR = refContLog.slice(0, 6).map(c => `${c.t || 0}:+${c.extra || 0}/R=${(c.R==null?'?':('0x'+(c.R&0xFF).toString(16)))}`);
    console.log(`  ref contention sample: ${sampleR.join(', ')}`);
  } else {
    console.log('  ref contention sample: <none>');
  }

  console.log(`  contentionNearPort?: ${nearby ? 'yes' : 'no (FAIL)'}${nearby ? '' : ' — expected at least one event within ±' + TOL + ' t-states'}`);
  console.log('-'.repeat(80));
}

if (mismatch) {
  console.log('RESULT: MISMATCHES FOUND — see details above');
  process.exit(2);
} else {
  console.log('RESULT: traces appear to match for R and contention timeline (within tolerance)');
  process.exit(0);
}
