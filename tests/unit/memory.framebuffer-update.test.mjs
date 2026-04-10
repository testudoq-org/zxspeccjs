import { test, expect, vi } from 'vitest';
import { Memory } from '../../src/memory.mjs';

test('Memory.write surfaces screen writes to FrameBuffer + FrameRenderer when running under tests', async () => {
  const mem = new Memory({ model: '48k' });
  // Attach a fake CPU to satisfy contention/read hooks
  mem.attachCPU({ tstates: 0, PC: 0x0000, R: 0x00 });

  // Install test harness globals
  globalThis.__TEST__ = true;
  // Provide a fake emu.ula with spies for generateFromMemory / render
  const fbGen = vi.fn();
  const frRender = vi.fn();
  globalThis.emu = { ula: { useDeferredRendering: true, frameBuffer: { generateFromMemory: fbGen, getFlashPhase: () => 0 }, frameRenderer: { render: frRender } } };

  // Perform a write into screen bitmap area - should schedule the coalesced update
  mem.write(0x4000, 0xAA);

  // Wait one tick for the debounced update to run
  await new Promise((r) => setTimeout(r, 0));

  expect(fbGen).toHaveBeenCalled();
  expect(frRender).toHaveBeenCalled();

  // Clean up test globals
  delete globalThis.__TEST__;
  delete globalThis.emu;
});
