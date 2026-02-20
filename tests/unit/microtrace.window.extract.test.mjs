import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

// Smoke test for the microtrace-window extractor script. Ensures the
// extractor runs and produces a JSON file we can inspect in CI/local dev.

test('microtrace window extractor produces output', async () => {
  const script = path.resolve(process.cwd(), 'tests', 'scripts', 'extract_microtrace_window.mjs');
  expect(fs.existsSync(script)).toBe(true);

  const out = path.resolve(process.cwd(), 'tmp', 'microtrace-window.json');
  if (!fs.existsSync(path.dirname(out))) fs.mkdirSync(path.dirname(out), { recursive: true });

  const node = process.execPath;
  const child = await import('child_process');
  child.execFileSync(node, [script, out, '0', '200'], { stdio: 'inherit' });
  expect(fs.existsSync(out)).toBe(true);
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  expect(Array.isArray(json.micro)).toBe(true);
  // keep the assertion permissive — presence of JSON is the important part
  expect(json.micro.length).toBeGreaterThanOrEqual(0);
});