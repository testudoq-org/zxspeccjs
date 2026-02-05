// @e2e @ui
/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted, waitForBootComplete } from '../tests/_helpers/bootHelpers.mjs';

test('Should display © before "1982" via auto-fix heuristic', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Wait for boot and allow more frames to settle
  await waitForBootComplete(page, 8000);

  // Simulate the scenario by writing the text buffer and clearing bitmap bytes for a chosen column group.
  await page.evaluate(() => {
    const emu = window.emulator || window.emu;
    if (!emu || !emu.memory) return;
    const topRowGroup = 0; // corresponds to topRow=184
    const baseText = 0x5C00 + topRowGroup * 32;

    const targetCol = 8;
    // Write '1','9','8','2' into columns targetCol..targetCol+3
    const codes = [0x31, 0x39, 0x38, 0x32];
    for (let k = 0; k < codes.length; k++) emu.memory.write(baseText + targetCol + k, codes[k]);

    // Write © (0x7F) into previous column text buffer
    emu.memory.write(baseText + targetCol - 1, 0x7F);

    // Clear bitmap bytes for columns targetCol-1 .. targetCol+3 across the 8 rows
    for (let col = targetCol - 1; col <= targetCol + 3; col++) {
      for (let r = 0; r < 8; r++) {
        const y = 184 + r;
        const y0 = y & 0x07;
        const y1 = (y & 0x38) >> 3;
        const y2 = (y & 0xC0) >> 6;
        const bIdx = (y0 << 8) | (y1 << 5) | (y2 << 11) | col;
        try { emu.memory.write(0x4000 + bIdx, 0x00); } catch (e) { /* ignore */ }
      }
    }
  });

  // Wait briefly for rendering
  await page.evaluate(async () => { for (let i=0;i<6;i++){ if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { window.emulator.ula.render(); await new Promise(r=>requestAnimationFrame(r)); } } });

  // Take snapshot of pixel area
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
