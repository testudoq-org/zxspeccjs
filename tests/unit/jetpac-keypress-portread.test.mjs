/* eslint-env node */
/* global process */
import { test, expect } from 'vitest';
import child from 'child_process';
import path from 'path';

// Fail-first regression test: pressing '5' in the Jetpac snapshot should
// produce at least one IN (0xFE) keyboard port read during the following
// frames. This currently fails locally (no portReads captured) and will
// prevent regressions when the polling/timing bug is fixed.

test('Jetpac: pressing 5 should generate IN(0xFE) reads (fail-first)', () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'run_jetpac_press5_node.mjs');
  const out = child.execFileSync(process.execPath, [script], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 });

  // Extract the JSON array printed after the "Collected portReads (0xFE) after pressing 5:" marker
  const marker = 'Collected portReads (0xFE) after pressing 5:';
  const idx = out.indexOf(marker);
  expect(idx).toBeGreaterThanOrEqual(0);
  const after = out.slice(idx + marker.length);
  const firstBracket = after.indexOf('[');
  const lastBracket = after.indexOf(']');
  expect(firstBracket).toBeGreaterThanOrEqual(0);
  expect(lastBracket).toBeGreaterThanOrEqual(0);
  const jsonText = after.slice(firstBracket, lastBracket + 1);

  let reads = [];
  try { reads = JSON.parse(jsonText); } catch (e) { /* keep reads empty */ }

  // FAIL-FIRST: assert we see at least one port read to 0xFE while the key is pressed
  expect(Array.isArray(reads)).toBe(true);
  expect(reads.length, 'expected at least one IN(0xFE) read after pressing 5').toBeGreaterThan(0);
}, 60000);
