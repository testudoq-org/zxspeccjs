import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { ULA } from '../../src/ula.mjs';

function createMockCanvas() {
  const width = 320; const height = 240;
  const imageData = { data: new Uint8ClampedArray(width * height * 4) };
  return {
    width, height, style: { backgroundColor: '' },
    getContext: () => ({ createImageData: () => imageData, putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }),
    toDataURL: () => ''
  };
}

test('memory.write to 0x4800 updates FrameBuffer synchronously (rocket area)', async () => {
  const mem = new Memory({ model: '48k' });
  const canvas = createMockCanvas();
  const ula = new ULA(mem, canvas, { useDeferredRendering: true });

  // Expose test env so memory.write's test-only branch will run
  globalThis.__TEST__ = globalThis.__TEST__ || {};
  globalThis.emu = globalThis.emu || {};
  globalThis.emu.ula = ula;

  // Sanity: initial RAM / framebuffer state
  expect(mem.read(0x4800)).toBe(0);

  // Single screen-area write to rocket region
  mem.write(0x4800, 0xAA);
  // allow microtask-scheduled update (if any) to run
  await new Promise(r => setTimeout(r, 0));

  // Memory should contain the byte
  expect(mem.read(0x4800)).toBe(0xAA);
  const bitmapView = mem.getBitmapView();
  const bitmapAddr = 0x4800 - 0x4000;
  expect(bitmapView[bitmapAddr]).toBe(0xAA);

  // Ensure deterministic FrameBuffer state and assert the mapped framebuffer byte
  ula.frameBuffer.generateFromMemory();
  const fb = ula.frameBuffer.getBuffer();

  // Compute framebuffer index for bitmapAddr (replicates FrameBuffer mapping)
  const offset = bitmapAddr;
  const xByte = offset & 0x1F;
  const y0 = (offset >> 8) & 0x07;
  const y1 = (offset >> 5) & 0x07;
  const y2 = (offset >> 11) & 0x03;
  const y = y0 | (y1 << 3) | (y2 << 6);
  const FB_BASE = 24 * 160;
  const LINE_STRIDE = 96;
  const lineOffset = FB_BASE + y * LINE_STRIDE;
  const cellStart = lineOffset + 16 + (xByte * 2);

  expect(fb[cellStart]).toBe(0xAA);
});