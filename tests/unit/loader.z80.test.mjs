import { test, expect } from 'vitest';
import { Loader } from '../../src/loader.mjs';

function generateZ80() {
  const header = new Uint8Array(30);
  header[0x0C] = 0x00; // PC low
  header[0x0D] = 0x40; // PC high -> 0x4000
  const ram = new Uint8Array(48 * 1024);
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out.buffer;
}

test('parseZ80 extracts 48K RAM and PC register', () => {
  const buf = generateZ80();
  const parsed = Loader.parseZ80(buf);
  expect(parsed).toHaveProperty('snapshot');
  expect(parsed.snapshot.ram).toBeInstanceOf(Uint8Array);
  expect(parsed.snapshot.ram.length).toBeGreaterThanOrEqual(48 * 1024);
  expect(typeof parsed.snapshot.registers.PC).toBe('number');
  expect(parsed.snapshot.registers.PC).toBe(0x4000);
});