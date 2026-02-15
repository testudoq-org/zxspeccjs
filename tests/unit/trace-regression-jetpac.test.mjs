import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

// Regression test: validate frame-0 events from our Jetpac capture against
// the synthetic JSSpeccy reference. This test will fail-on-regression when
// important per-frame events (screen writes / ULA port writes) diverge.

const OUR_TRACE = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
const REF_TRACE = path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.json');

function loadTrace(p) {
  if (!fs.existsSync(p)) throw new Error(`Trace not found: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Helper: regenerate the Jetpac trace using the capture script so tests
// always run against the current emulator implementation. This makes the
// regression test fail-for-real if runtime behavior is incorrect.
function regenJetpacTrace() {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'capture_jetpac_trace.mjs');
  if (!fs.existsSync(script)) throw new Error('capture_jetpac_trace.mjs missing');
  try {
    // Run synchronously; capture_jetpac_trace writes traces/jetpac_trace.json
    require('child_process').execFileSync(process.execPath, [script], { stdio: 'inherit' });
  } catch (e) {
    throw new Error('Failed to regenerate jetpac trace: ' + e.message);
  }
}

function findMemWrite(frame, addr, value) {
  if (!frame.memWrites) return undefined;
  return frame.memWrites.find(m => (m.addr === addr && (typeof value === 'undefined' || m.value === value)));
}

function findPortWrite(frame, portLow, value) {
  if (!frame.portWrites) return undefined;
  return frame.portWrites.find(p => ((p.port & 0xff) === (portLow & 0xff)) && (typeof value === 'undefined' || p.value === value));
}

test('trace parity: compare R register and contention timeline against jsspeccy reference for multiple frames', () => {
  // regenerate our trace if missing so CI can run this test locally
  if (!fs.existsSync(OUR_TRACE)) {
    try { regenJetpacTrace(); } catch (e) { /* allow test to fail below with clear message */ }
  }

  const our = loadTrace(OUR_TRACE);
  const ref = loadTrace(REF_TRACE);

  expect(Array.isArray(our.frames)).toBe(true);
  expect(Array.isArray(ref.frames)).toBe(true);
  expect(our.frames.length).toBeGreaterThan(0);
  expect(ref.frames.length).toBeGreaterThan(0);

  const FRAMES_TO_COMPARE = Math.min(parseInt(process.env.TRACE_COMPARE_FRAMES || '10', 10), our.frames.length, ref.frames.length);
  expect(FRAMES_TO_COMPARE).toBeGreaterThan(0);

  const tTol = 50; // allowed t-state tolerance for matching events

  for (let i = 0; i < FRAMES_TO_COMPARE; i++) {
    const ourF = our.frames[i];
    const refF = ref.frames[i];

    // basic sanity: memWrite @0x4001 exists in reference -> must exist in our trace
    const refMem = findMemWrite(refF, 0x4001);
    expect(refMem, `frame ${i}: reference must include memWrite @0x4001`).toBeDefined();

    const ourMem = findMemWrite(ourF, 0x4001, refMem ? refMem.value : undefined);
    expect(ourMem, `frame ${i}: our trace missing memWrite @0x4001 matching reference`).toBeDefined();

    // port write parity for ULA OUT (0xFE)
    const refPort = (refF.portWrites || []).find(p => (p.port & 0xFF) === 0xFE);
    expect(refPort, `frame ${i}: reference must include a port write to 0xFE`).toBeDefined();

    const ourPort = (ourF.portWrites || []).find(p => (p.port & 0xFF) === 0xFE && (typeof refPort === 'undefined' || p.value === refPort.value));
    expect(ourPort, `frame ${i}: our trace must contain a matching port write to 0xFE`).toBeDefined();

    // R-register parity (lower 7 bits) when regs snapshot exists in both traces
    if (refF.regs && ourF.regs) {
      const refR = (refF.regs.R || 0) & 0x7F;
      const ourR = (ourF.regs.R || 0) & 0x7F;
      expect(ourR === refR, `frame ${i}: R mismatch (our=${ourR}, ref=${refR})`).toBeTruthy();
    }

    // Contention timeline: ensure our trace recorded contention events and
    // that at least one contention event is close to the ULA OUT(0xFE) timing
    const ourContention = (ourF.contentionLog || []);
    expect(ourContention.length, `frame ${i}: our trace should include contention events`).toBeGreaterThan(0);
    expect((ourF.contentionHits || 0), `frame ${i}: contentionHits should be >0`).toBeGreaterThan(0);

    const portT = ourPort ? (ourPort.tstates || ourPort.t || 0) : null;
    const hasNearby = ourContention.some(c => Math.abs((c.t || 0) - (portT || 0)) <= tTol);
    expect(hasNearby, `frame ${i}: no contention event found near ULA OUT timing (tTol=${tTol})`).toBeTruthy();

    // Optional: compare counts of contention events across frames to detect abrupt regressions
    const refContentionCount = (refF.contentionHits || 0);
    const ourContentionCount = (ourF.contentionHits || 0);
    // If reference provides contentionHits (synthetic or generated), require close parity
    if (typeof refContentionCount === 'number' && refContentionCount > 0) {
      const diff = Math.abs(refContentionCount - ourContentionCount);
      expect(diff <= 2, `frame ${i}: contention hit count differs too much (ref=${refContentionCount}, our=${ourContentionCount})`).toBeTruthy();
    }
  }
});

  // 5) Contention diagnostics: our trace should include contention events and hits
  const ourContention = (ourF.contentionLog || []);
  expect(ourContention.length).toBeGreaterThan(0);
  expect((ourF.contentionHits || 0)).toBeGreaterThan(0);

  // Verify at least one contention event occured near the ULA OUT (0xFE)
  const portT = (ourPort && (ourPort.tstates || ourPort.t)) || null;
  const closeToPort = ourContention.some(c => Math.abs((c.t || 0) - (portT || 0)) <= tTol);
  expect(closeToPort, 'at least one contention event should be near the ULA OUT(0xFE) timing').toBeTruthy();

  // 6) R-register parity: per-frame R should match reference (lower-7 bits)
  if (refF.regs && ourF.regs) {
    const refR = (refF.regs.R || 0) & 0x7F;
    const ourR = (ourF.regs.R || 0) & 0x7F;
    expect(ourR).toBe(refR);
  }
});