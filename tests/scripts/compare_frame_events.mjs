#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const TOL = 1; // tolerance in T-states when matching events

function loadTrace(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function normalizeEvents(frame) {
  const evs = [];
  if (frame.memWrites) for (const m of frame.memWrites) evs.push({ type: 'memWrite', addr: m.addr, value: m.value, t: m.t });
  if (frame.portWrites) for (const p of frame.portWrites) evs.push({ type: 'portWrite', port: p.port, value: p.value, t: p.tstates || p.t });
  if (frame.regs && frame.regsSnapshot) {
    // unlikely here; kept for completeness
    evs.push({ type: 'regsSnapshot', regs: frame.regsSnapshot.regs, t: frame.regsSnapshot.t });
  }
  return evs.sort((a,b) => (a.t||0) - (b.t||0));
}

function findBestMatch(refEv, ourEvents, usedIdx) {
  let best = { idx: -1, dt: Infinity };
  for (let i = 0; i < ourEvents.length; i++) {
    if (usedIdx.has(i)) continue;
    const oe = ourEvents[i];
    if (oe.type !== refEv.type) continue;
    let keyMatch = true;
    if (refEv.type === 'memWrite') keyMatch = (refEv.addr === oe.addr && refEv.value === oe.value);
    if (refEv.type === 'portWrite') keyMatch = ((refEv.port & 0xFF) === (oe.port & 0xFF) && refEv.value === oe.value); // compare only low byte of port (ZX Spectrum ignores high byte)
    if (!keyMatch) continue;
    const dt = Math.abs((refEv.t || 0) - (oe.t || 0));
    if (dt < best.dt) best = { idx: i, dt };
  }
  return best;
}

function compareFrame(refFrame, ourFrame, frameIndex) {
  const refE = normalizeEvents(refFrame);
  const ourE = normalizeEvents(ourFrame);
  const used = new Set();
  const report = { frame: frameIndex, matches: [], missing: [], unexpected: [] };

  for (const r of refE) {
    const best = findBestMatch(r, ourE, used);
    if (best.idx === -1) {
      report.missing.push(r);
    } else {
      const oe = ourE[best.idx];
      used.add(best.idx);
      report.matches.push({ ref: r, our: oe, dt: best.dt, withinTolerance: best.dt <= TOL });
    }
  }

  for (let i = 0; i < ourE.length; i++) {
    if (!used.has(i)) report.unexpected.push(ourE[i]);
  }

  return report;
}

function short(ev) {
  if (!ev) return '';
  if (ev.type === 'memWrite') return `mem@0x${ev.addr.toString(16)}=0x${ev.value.toString(16)} @ t=${ev.t}`;
  if (ev.type === 'portWrite') return `port@0x${(ev.port||0).toString(16)}=0x${ev.value.toString(16)} @ t=${ev.t}`;
  return JSON.stringify(ev);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: compare_frame_events.mjs <traceA.json> <traceB.json> <frameIndex>');
    process.exit(1);
  }
  const [aPath, bPath, frameIdxStr] = args;
  const frameIdx = Number(frameIdxStr || 0);
  const A = loadTrace(aPath);
  const B = loadTrace(bPath);
  if (!A.frames || !B.frames) { console.error('Invalid trace format'); process.exit(1); }
  if (frameIdx < 0 || frameIdx >= Math.min(A.frames.length, B.frames.length)) { console.error('Frame index out of range'); process.exit(1); }

  const rep = compareFrame(B.frames[frameIdx], A.frames[frameIdx], frameIdx); // ref=B, our=A

  console.log(`Frame ${frameIdx} comparison:`);
  console.log(`  Matches (${rep.matches.length}):`);
  for (const m of rep.matches) console.log(`    ref: ${short(m.ref)}  <=>  our: ${short(m.our)}  dt=${m.dt} ${m.withinTolerance? 'OK' : 'MIS'}`);
  console.log(`  Missing in our trace (${rep.missing.length}):`);
  for (const mm of rep.missing) console.log(`    missing ref: ${short(mm)}`);
  console.log(`  Unexpected in our trace (${rep.unexpected.length}):`);
  for (const u of rep.unexpected) console.log(`    unexpected our: ${short(u)}`);
}

main().catch(e => { console.error('compare_frame_events failed', e); process.exit(1); });