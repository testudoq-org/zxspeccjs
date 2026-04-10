import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

// Sanity check: AssemblyScript sample files exist (non-blocking)

test('assemblyscript migration samples present', () => {
  const base = path.resolve(process.cwd(), 'examples', 'wasm');
  expect(fs.existsSync(path.join(base, 'z80_decoder.as'))).toBe(true);
  expect(fs.existsSync(path.join(base, 'contention_handler.as'))).toBe(true);
  expect(fs.existsSync(path.resolve(process.cwd(), 'asconfig.json'))).toBe(true);
});
