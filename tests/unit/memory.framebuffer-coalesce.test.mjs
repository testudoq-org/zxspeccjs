/* eslint-env node, vitest */
import { test, expect, vi } from 'vitest';
import { Memory } from '../../src/memory.mjs';

test('coalesces multiple screen writes into a single framebuffer regenerate+render', async () => {
  const mem = new Memory({ model: '48k' });
  mem.attachCPU({ tstates: 0, PC: 0x0000, R: 0x00 });

  // Test harness globals to surface deterministic behaviour
  globalThis.__TEST__ = true;
  const fbGen = vi.fn();
  const frRender = vi.fn();
  globalThis.emu = {
    ula: {
      useDeferredRendering: true,
      frameBuffer: { generateFromMemory: fbGen, getFlashPhase: () => 0 },
      frameRenderer: { render: frRender }
    }
  };

  // Burst-write a block of screen memory (simulate tight in-game writes)
  for (let a = 0x4800; a < 0x4800 + 64; a++) mem.write(a, a & 0xff);

  // Allow the debounce/coalesce tick to run
  await new Promise((r) => setTimeout(r, 0));

  // Expect only one authoritative regenerate + render for the burst
  expect(fbGen).toHaveBeenCalledTimes(1);
  expect(frRender).toHaveBeenCalledTimes(1);

  // Cleanup
  delete globalThis.__TEST__;
  delete globalThis.emu;
});
