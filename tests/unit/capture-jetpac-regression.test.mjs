import { test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import child from 'child_process';

test('capture_jetpac_trace produces memWrites for 0x4000 and 0x4001', () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'capture_jetpac_trace.mjs');
  // Force the synthetic payload for this unit test so memWrites at 0x4000/0x4001
  // (produced by the generateJetpacZ80Payload loop) are observable in frame 0.
  child.execFileSync(process.execPath, [script], { stdio: 'inherit', env: { ...process.env, FORCE_SYNTHETIC: '1' } });
  const tracePath = path.resolve(process.cwd(), 'traces', 'jetpac_trace.json');
  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  const f0 = trace.frames[0];
  const addrs = (f0.memWrites || []).map(m => m.addr);
  expect(addrs).toContain(0x4000);
  expect(addrs).toContain(0x4001);
}, 20000);