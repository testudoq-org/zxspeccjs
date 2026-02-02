/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from './_helpers/bootHelpers.mjs';

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
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      // sample a small block near bottom where topRowGroup maps (y ~ 184..191)
      const sx = Math.floor(canvas.width * 0.1);
      const sy = Math.floor(canvas.height * 0.86);
      const w = Math.min(32, canvas.width - sx);
      const h = Math.min(24, canvas.height - sy);
      const img = ctx.getImageData(sx, sy, w, h).data;
      const baseR = img[0], baseG = img[1], baseB = img[2];
      for (let i = 0; i < img.length; i += 4) {
        if (img[i] !== baseR || img[i+1] !== baseG || img[i+2] !== baseB) return true;
      }
    } catch (e) { void e; }
    return false;
  });

  expect(visible).toBe(true);
});
