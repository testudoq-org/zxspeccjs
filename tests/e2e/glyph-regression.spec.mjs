// @e2e @ui
/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../_helpers/bootHelpers.mjs';

test.describe('Glyph regression: ensure © (0x7F) is visible on canvas', () => {
  test('© glyph should appear via auto-backfill when ROM/CHARS present', async ({ page }) => {
    const consoleMsgs = await setupDiagnostics(page);
    await page.goto('http://localhost:8080/');
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Start emulator and ensure started
    await page.click('#startBtn').catch(() => {});
    await ensureStarted(page);

    // Wait up to 3s for CHARS pointer and ROM glyph to be present
    let charsOk = false;
    for (let i = 0; i < 30; i++) {
      const found = await page.evaluate(() => {
        try {
          const dbg = window.__ZX_DEBUG__;
          if (!dbg || typeof dbg.readROM !== 'function' || typeof dbg.peekMemory !== 'function') return false;
          // ROM contains 0x7F
          let romHas = false;
          for (let a = 0x1530; a < 0x1550; a++) if (dbg.readROM(a) === 0x7F) romHas = true;
          const chars = dbg.peekMemory(0x5C36, 2);
          const charsPtr = (chars && chars[1] !== undefined) ? ((chars[1] << 8) | chars[0]) : 0;
          return romHas && (charsPtr !== 0 && charsPtr !== 0x0000);
        } catch (e) { return false; }
      });
      if (found) { charsOk = true; break; }
      await page.waitForTimeout(100);
    }
    expect(charsOk).toBe(true);

    // Wait up to 3s for any bottom-column rows to show the 0x7F character code (ROM timing may vary)
    let inspect = null;
    let colsWith7F = [];
    const start = Date.now();
    while ((Date.now() - start) < 3000) {
      inspect = await page.evaluate(() => {
        try {
          const dbg = window.__ZX_DEBUG__;
          if (!dbg || typeof dbg.peekMemory !== 'function') return null;
          const row = 191; // bottom row
          const base = 0x5C00 + (Math.floor(row / 8) * 32);
          const arr = dbg.peekMemory(base, 32);
          const cols = [];
          for (let c = 0; c < 32; c++) if (arr[c] === 0x7F) cols.push(c);
          return cols;
        } catch (e) { return null; }
      });
      if (inspect && inspect.length) { colsWith7F = inspect; break; }
      await page.waitForTimeout(100);
    }

    expect(colsWith7F.length).toBeGreaterThan(0);

    // Optionally verify visible pixels for one of the columns
    const col = colsWith7F[0];
    const px = await page.evaluate((col) => {
      try {
        const canvas = document.getElementById('screen');
        const ctx = canvas.getContext('2d');
        const x = col * 8 + 4; // approximate center
        const y = 190;
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      } catch (e) { return null; }
    }, col);

    expect(px).not.toBeNull();
    expect(px[0] + px[1] + px[2]).toBeGreaterThan(0);
  });
});
