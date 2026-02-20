import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

test('parsed_jetpac_snapshot.json registers: IFF1 should be true', () => {
  const parsedPath = path.resolve('traces', 'parsed_jetpac_snapshot.json');
  expect(fs.existsSync(parsedPath)).toBe(true);
  const json = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));
  expect(json.registers, 'snapshot should include registers').toBeDefined();
  expect(json.registers.IFF1, 'parsed snapshot must have IFF1=true for Jetpac start behaviour').toBeTruthy();
});