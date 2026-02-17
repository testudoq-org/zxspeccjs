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
const TOL = 120; // t-state tolerance for "nearby" checks (increased to allow small timing skew)
// Optional rocket-area per-write diff: set --rocket-diff or ROCKET_DIFF=1
const rocketDiff = argv.includes('--rocket-diff') || process.env.ROCKET_DIFF === '1';


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

  // Decide whether to require a contention event near the ULA OUT timing.
  // If the *reference* provides contention diagnostics, require our trace to
  // contain a nearby contention event; otherwise treat as N/A (don't fail).
  const refProvidesContention = (refContLog.length > 0) || (refCH > 0);
  let nearby = 'N/A';
  if (refProvidesContention) {
    nearby = (portT !== null) ? ourContLog.some(c => Math.abs((c.t || 0) - portT) <= TOL) : false;
    if (!nearby) mismatch = true;
  } else {
    // reference doesn't advertise contention for this frame — mark N/A and continue
    nearby = 'N/A';
  }

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

  const nearbyLabel = (nearby === 'N/A') ? 'N/A' : (nearby ? 'yes' : 'no (FAIL)');
  const expectedNote = (nearby === 'N/A') ? '' : (' — expected at least one event within ±' + TOL + ' t-states');
  console.log(`  contentionNearPort?: ${nearbyLabel}${expectedNote}`);

  // Optional: per-write diffs for the rocket area (0x4800..0x49FF)
  if (rocketDiff) {
    const ourRocket = (of.memWrites || []).filter(w => w.addr >= 0x4800 && w.addr < 0x4A00);
    const refRocket = (rf.memWrites || []).filter(w => w.addr >= 0x4800 && w.addr < 0x4A00);
    console.log(`  rocketWrites: our=${ourRocket.length} ref=${refRocket.length}`);
    const maxLen = Math.max(ourRocket.length, refRocket.length);
    for (let j = 0; j < maxLen; j++) {
      const ou = ourRocket[j];
      const rfw = refRocket[j];
      if (!ou) { console.log(`    [MISSING-OUR] ref[${j}] addr=0x${(rfw.addr||0).toString(16)} t=${rfw.t||rfw.tstates||'?'}`); mismatch = true; continue; }
      if (!rfw) { console.log(`    [MISSING-REF] our[${j}] addr=0x${(ou.addr||0).toString(16)} t=${ou.t||ou.tstates||'?'}`); mismatch = true; continue; }
      const addrMatch = (ou.addr === rfw.addr);
      const valMatch = (ou.value === rfw.value);
      const tDiff = Math.abs((ou.t || ou.tstates || 0) - (rfw.t || rfw.tstates || 0));
      const pcMatch = ((ou.pc || 0) === (rfw.pc || 0));
      const rMatchWrite = (addrMatch && valMatch && tDiff <= TOL && pcMatch);
      console.log(`    [${rMatchWrite ? 'OK' : 'DIFF'}] idx=${j} addr=0x${(ou.addr||0).toString(16)} our(t=${ou.t||ou.tstates||'?'},pc=${ou.pc||'?'},R=${ou.R!=null?('0x'+(ou.R&0xFF).toString(16)):'?'}) ref(t=${rfw.t||rfw.tstates||'?'},pc=${rfw.pc||'?'}) td=${tDiff} val(our=${ou.value} ref=${rfw.value})`);
      if (!rMatchWrite) mismatch = true;
    }
  }

  console.log('-'.repeat(80));
}

if (mismatch) {
  console.log('RESULT: MISMATCHES FOUND — see details above');
  process.exit(2);
} else {
  console.log('RESULT: traces appear to match for R and contention timeline (within tolerance)');
  process.exit(0);
}
