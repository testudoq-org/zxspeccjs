import { test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import child from 'child_process';

test('capture_jetpac_trace produces memWrites for 0x4000 and 0x4001', () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'capture_jetpac_trace.mjs');
  // Run the capture script for a few frames to allow the ROM/interrupt path
  // to execute — snapshot-derived timing can vary across environments.
  const FRAMES = 8;
  child.execFileSync(process.execPath, [script], { stdio: 'inherit', env: { ...process.env, FRAMES: String(FRAMES) } });
  const tracePath = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));

  // Look for memWrites to 0x4000/0x4001 in the first N frames (not strictly frame-0)
  const found4000 = trace.frames.slice(0, FRAMES).some(f => (f.memWrites || []).some(m => m.addr === 0x4000));
  const found4001 = trace.frames.slice(0, FRAMES).some(f => (f.memWrites || []).some(m => m.addr === 0x4001));
  expect(found4000, `expected memWrite@0x4000 within first ${FRAMES} frames`).toBeTruthy();
  expect(found4001, `expected memWrite@0x4001 within first ${FRAMES} frames`).toBeTruthy();
}, 20000);