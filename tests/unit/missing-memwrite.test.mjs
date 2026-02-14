import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { ULA } from '../../src/ula.mjs';

// Repro case for the missing screen memWrite (addresses 0x4000 and 0x4001)
// - Ensure Memory deterministically records screenBitmapWrites when running under tests
// - Ensure ULA / memory view reflects the writes

test('memory records consecutive screen writes (no sampling) and ULA sees them', () => {
  // Ensure test hook exists
  try { globalThis.window = globalThis.window || {}; } catch (e) { /* ignore */ }
  globalThis.window.__TEST__ = {};

  const mem = new Memory({ model: '48k' });
  const canvasStub = { width: 256, height: 192, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }), putImageData: () => {}, imageSmoothingEnabled: false }) };
  const ula = new ULA(mem, canvasStub);

  // Clear any prior test logs
  globalThis.window.__TEST__.screenBitmapWrites = [];

  // Write two consecutive bytes into the screen bitmap
  const ok0 = mem.write(0x4000, 0xAA);
  const ok1 = mem.write(0x4001, 0x55);

  expect(ok0).toBe(true);
  expect(ok1).toBe(true);

  // Deterministic logging: both addresses must be present in screenBitmapWrites
  const addrs = (globalThis.window.__TEST__.screenBitmapWrites || []).map(e => e.addr);
  expect(addrs).toContain(0x4000);
  expect(addrs).toContain(0x4001);

  // ULA / memory view should reflect the writes
  const bm = mem.getBitmapView();
  expect(bm[0]).toBe(0xAA);
  expect(bm[1]).toBe(0x55);

  // Clean up test hook
  delete globalThis.window.__TEST__;
});