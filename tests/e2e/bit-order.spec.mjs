/* eslint-disable no-console, no-unused-vars, no-undef */
/* eslint-env browser, node, es2021 */
/* global window document */

// @e2e @ui
import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted, safeGoto } from '../_helpers/bootHelpers.mjs';

// This test verifies MSB-first mapping: writing 0x80 into bitmap should light left-most pixel of the byte
test('ULA bit-order: 0x80 renders as left-most pixel', async ({ page }) => {
  await setupDiagnostics(page);
  // Use resilient navigation helper to avoid transient Playwright storage/navigation race
  // increase tries/timeout to harden against sporadic frame/storage races
  await safeGoto(page, '/', { tries: 5, timeout: 15000 });
  try {
    await page.waitForSelector('#screen', { timeout: 10000 });
  } catch (e) {
    // Capture any early init errors for diagnostics then rethrow with details
    let initErrs = [];
    try { initErrs = await page.evaluate(() => window.__INIT_ERRORS__ || []); } catch (e2) { void e2; }
    throw new Error(`Navigation/setup failed; init errors: ${JSON.stringify((initErrs || []).slice(-20))} - ${e && e.message ? e.message : String(e)}`);
  }
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Write a single byte 0x80 to the very top-left byte of the bitmap (y=0, xByte=0)
  await page.evaluate(() => {
    const emu = window.emulator || window.emu;
    if (!emu || !emu.memory) return;
    // Compute bitmap index for y=0, xByte=0 using canonical formula
    const y = 0;
    const xByte = 0;
    const bIndex = (((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | xByte) & 0x1fff;
    const addr = 0x4000 + bIndex;
    // write 0x80 into bitmap
    emu.memory.write(addr, 0x80);
    // set attribute for top-left cell to white ink on black paper
    const attrAddr = 0x5800 + (Math.floor(y / 8) * 32) + xByte;
    emu.memory.write(attrAddr, 0x07);
  });

  // Force a render and then sample pixel (0,0)
  const pixel = await page.evaluate(async () => {
    try {
      if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') {
        window.emulator.ula.render();
        await new Promise(r => window.requestAnimationFrame(r));
      }
      const canvas = document.getElementById('screen');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    } catch (e) { return null; }
  });

  expect(pixel).not.toBeNull();
  // Expect non-background (not black) because attr was set to white ink on black paper
  const [r, g, b] = pixel;
  const isBlack = (r === 0 && g === 0 && b === 0);
  expect(isBlack).toBe(false);
});
