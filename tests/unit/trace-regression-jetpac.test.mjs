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

test('frame-0: memWrite 0x4001 exists and ULA port writes normalize to 0xFE', () => {
  const our = loadTrace(OUR_TRACE);
  const ref = loadTrace(REF_TRACE);

  expect(Array.isArray(our.frames)).toBe(true);
  expect(Array.isArray(ref.frames)).toBe(true);
  expect(our.frames.length).toBeGreaterThan(0);
  expect(ref.frames.length).toBeGreaterThan(0);

  const ourF = our.frames[0];
  const refF = ref.frames[0];

  // 1) Reference must contain the memWrite at 0x4001 (known Jetpac behaviour)
  const refMem = findMemWrite(refF, 0x4001);
  expect(refMem, 'reference must include memWrite @0x4001').toBeDefined();

  // 2) Our trace must also include the memWrite @0x4001 with the same value
  const ourMem = findMemWrite(ourF, 0x4001, refMem.value);
  expect(ourMem, 'our trace missing memWrite @0x4001 matching reference').toBeDefined();

  // 3) Reference should have a ULA OUT (port low byte 0xFE). Assert our trace contains a matching port write
  const refPort = (refF.portWrites || []).find(p => (p.port & 0xff) === 0xFE);
  expect(refPort, 'reference must include a port write to 0xFE').toBeDefined();

  const ourPort = findPortWrite(ourF, 0xFE, refPort ? refPort.value : undefined);
  expect(ourPort, 'our trace must contain a port write whose low byte is 0xFE and matching value').toBeDefined();

  // 4) Timing: t-state of our matching events should be within ±2 T-states of reference
  const tTol = 2;
  if (refMem && ourMem) expect(Math.abs((ourMem.t || 0) - (refMem.t || 0))).toBeLessThanOrEqual(tTol);
  if (refPort && ourPort) expect(Math.abs((ourPort.tstates || ourPort.t || 0) - (refPort.tstates || refPort.t || 0))).toBeLessThanOrEqual(tTol);
});