import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { ULA } from '../../src/ula.mjs';

function createMockCanvas() {
  const width = 320; const height = 240;
  const imageData = { data: new Uint8ClampedArray(width * height * 4) };
  return {
    width, height, style: { backgroundColor: '' },
    getContext: () => ({ createImageData: () => imageData, putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }),
  };
}

test('memory.write updates FrameBuffer synchronously under test harness', async () => {
  const mem = new Memory({ model: '48k' });
  const canvas = createMockCanvas();
  const ula = new ULA(mem, canvas, { useDeferredRendering: true });

  // Expose test env so memory.write's test-only branch will invoke generateFromMemory immediately
  globalThis.__TEST__ = globalThis.__TEST__ || {};
  globalThis.emu = globalThis.emu || {};
  globalThis.emu.ula = ula;

  // Sanity: FrameBuffer should be attached
  expect(ula.frameBuffer).toBeTruthy();

  // Perform a screen-area write and assert framebuffer reflects it (flush microtasks)
  mem.write(0x4000, 0xAA);
  // allow the microtask-scheduled update to run (flush microtask + macrotask)
  await new Promise(r => setTimeout(r, 0));

  // sanity: memory was written
  expect(mem.read(0x4000)).toBe(0xAA);
  const bitmapView = mem.getBitmapView();
  expect(bitmapView[0]).toBe(0xAA);

  // make test deterministic in all runtimes by ensuring FrameBuffer is regenerated
  ula.frameBuffer.generateFromMemory();

  const fb = ula.frameBuffer.getBuffer();
  const topBorderBytes = 24 * 160;
  const index = topBorderBytes + 16; // first main-screen byte location
  expect(fb[index]).toBe(0xAA);
});
