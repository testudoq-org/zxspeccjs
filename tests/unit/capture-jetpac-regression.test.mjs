/* eslint-env node */
import { test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import child from 'child_process';

test('capture_jetpac_trace produces memWrites to screen RAM in first 8 frames', () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'capture_jetpac_trace.mjs');
  // Run the capture script for a few frames to allow the ROM/interrupt path
  // to execute — snapshot-derived timing can vary across environments.
  const FRAMES = 8;
  // Cap micro-log per frame to avoid hitting the Node.js heap limit when
  // multiple vitest workers run concurrently.
  child.execFileSync(process.execPath, ['--max-old-space-size=4096', script], { stdio: 'inherit', env: { ...process.env, FRAMES: String(FRAMES), MAX_MICRO_PER_FRAME: '50', MAX_CONTENTION_LOG: '20' } });
  const tracePath = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));

  // Look for memWrites to screen RAM (0x4000-0x5AFF) in the first N frames.
  // The real Jetpac game writes sprite/background data to various screen addresses
  // on every frame — not necessarily to 0x4000/0x4001 specifically
  // (those were artefacts of the now-removed synthetic loop injection).
  const foundScreenWrite = trace.frames.slice(0, FRAMES).some(
    f => (f.memWrites || []).some(m => m.addr >= 0x4000 && m.addr <= 0x5AFF)
  );
  expect(foundScreenWrite, `expected memWrite to screen RAM (0x4000-0x5AFF) within first ${FRAMES} frames`).toBeTruthy();
}, 20000);
