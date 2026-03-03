/* eslint-env node */
import { test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import child from 'child_process';

test('capture_jetpac_trace captures rocket/part memWrites and contention after START', () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'capture_jetpac_trace.mjs');
  if (!fs.existsSync(script)) throw new Error('capture_jetpac_trace.mjs missing');

  // Run capture with injected START key at frame 5 for 2 frames.
  // Limit to 30 frames (covers frames 5-24 for rocket writes) and cap
  // the micro-log per frame to reduce peak memory during JSON serialisation.
  const CAPTURE_FRAMES = 30;
  child.execFileSync(process.execPath, ['--max-old-space-size=4096', script], {
    stdio: 'inherit',
    env: { ...process.env, PRESS_FRAME: '5', PRESS_DURATION: '2', USE_PARSED_JETPAC: '1', FRAMES: String(CAPTURE_FRAMES), MAX_MICRO_PER_FRAME: '50', MAX_CONTENTION_LOG: '20' }
  });

  const tracePath = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
  if (!fs.existsSync(tracePath)) throw new Error('jetpac_trace.json not produced');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));

  expect(Array.isArray(trace.frames)).toBe(true);
  expect(trace.frames.length).toBeGreaterThan(10);

  // Look for memWrites in rocket tile area 0x4800..0x49FF in frames after the press
  const startFrame = 5;
  let found = false;
  for (let f = startFrame; f < Math.min(trace.frames.length, startFrame + 20); f++) {
    const fw = trace.frames[f].memWrites || [];
    if (fw.some(m => m.addr >= 0x4800 && m.addr <= 0x49FF)) { found = true; break; }
  }
  expect(found, 'expected memWrites to rocket area after pressing START').toBeTruthy();

  // Also assert contention diagnostics exist (contentionHits > 0 in captured frames)
  const anyContention = trace.frames.some(fr => (fr.contentionHits && fr.contentionHits > 0) || (fr.contentionLog && fr.contentionLog.length > 0));
  expect(anyContention, 'expected contention diagnostics in trace frames').toBeTruthy();
}, 60000);
