// @e2e @ui
/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../tests/_helpers/bootHelpers.mjs';

test('Render © (0x7F) by injecting text buffer and forcing auto-backfill', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Inject 0x7F into top-row text buffer and clear its bitmap bytes
  await page.evaluate(() => {
    const emu = window.emulator || window.emu;
    if (!emu || !emu.memory) return;
    const topRowGroup = 0; // text buffer group corresponding to top rows
    const baseText = 0x5C00 + topRowGroup * 32;
    const targetCol = 4;
    // write 0x7F at targetCol
    emu.memory.write(baseText + targetCol, 0x7F);
    // clear bitmap for that column across 8 rows
    for (let r = 0; r < 8; r++) {
      const y = 184 + r;
      const bIndex = (((y & 0x07) << 8) | ((y & 0x38) << 2) | ((y & 0xC0) << 5) | targetCol) & 0x1fff;
      try { emu.memory.write(0x4000 + bIndex, 0x00); } catch (e) { /* ignore */ }
    }
    // set attribute to white ink on black paper
    const attrAddr = 0x5800 + (Math.floor(184 / 8) * 32) + targetCol;
    try { emu.memory.write(attrAddr, 0x07); } catch (e) { /* ignore */ }
  });

  // Force renders
  await page.evaluate(async () => { for (let i=0;i<6;i++){ if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { window.emulator.ula.render(); await new Promise(r=>requestAnimationFrame(r)); } } });

  // Sample canvas pixels covering the injected column area
  const visible = await page.evaluate(() => {
    try {
      const canvas = document.getElementById('screen');
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(10, 186, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3] };
    } catch (e) { return { error: String(e) }; }
  });

  expect(visible).not.toBeNull();
  expect(visible.error).toBeUndefined();
  // Expect non-background pixel
  const isBlack = (visible.r === 0 && visible.g === 0 && visible.b === 0);
  expect(isBlack).toBe(false);
});
