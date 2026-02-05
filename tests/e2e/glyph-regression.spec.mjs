// @e2e @ui
/* eslint-disable no-console, no-unused-vars */
/* eslint-env browser, node, es2021 */
/* global window document */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../_helpers/bootHelpers.mjs';

test.describe('Glyph regression: ensure © (0x7F) is visible on canvas', () => {
  // Shared setup for tests in this suite
  test.beforeEach(async ({ page }) => {
    await setupDiagnostics(page);
    await page.goto('http://localhost:8080/');
    await page.waitForSelector('#screen', { timeout: 10000 });
    await page.click('#startBtn').catch(() => {});
    await ensureStarted(page);
  });

  // Helper: wait for CHARS pointer and ROM presence of 0x7F
  async function waitForChars(page, timeout = 3000, interval = 100) {
    const attempts = Math.ceil(timeout / interval);
    for (let i = 0; i < attempts; i++) {
      // Is debug API available?
      const dbgAvailable = await page.evaluate(() => {
        try { const dbg = window.__ZX_DEBUG__; return !!(dbg && typeof dbg.readROM === 'function' && typeof dbg.peekMemory === 'function'); } catch (e) { return false; }
      });
      if (!dbgAvailable) { await page.waitForTimeout(interval); continue; }

      // Does ROM contain 0x7F (©)?
      const romHas = await page.evaluate(() => {
        try { const dbg = window.__ZX_DEBUG__; for (let a = 0x1530; a < 0x1550; a++) if (dbg.readROM(a) === 0x7F) return true; return false; } catch (e) { return false; }
      });
      if (!romHas) { await page.waitForTimeout(interval); continue; }

      // Is CHARS pointer populated?
      const charsPtr = await page.evaluate(() => {
        try { const dbg = window.__ZX_DEBUG__; const chars = dbg.peekMemory(0x5C36, 2); return (chars && chars[1] !== undefined) ? ((chars[1] << 8) | chars[0]) : 0; } catch (e) { return 0; }
      });
      if (charsPtr !== 0 && charsPtr !== 0x0000) return true;

      await page.waitForTimeout(interval);
    }
    return false;
  }

  // Helper: wait for glyph to appear either via debug snapshot or canvas pixels
  async function waitForGlyph(page, timeout = 3000, interval = 100) {
    const attempts = Math.ceil(timeout / interval);
    for (let i = 0; i < attempts; i++) {
      // Is snapshotGlyph available?
      const snapshotAvailable = await page.evaluate(() => {
        try { const dbg = window.__ZX_DEBUG__; return !!(dbg && typeof dbg.snapshotGlyph === 'function'); } catch (e) { return false; }
      });

      if (snapshotAvailable) {
        // Check columns individually (keeps each evaluate small/simple)
        for (let col = 0; col < 32; col++) {
          const colHas = await page.evaluate((c) => {
            try { const s = window.__ZX_DEBUG__.snapshotGlyph(c, 191); return !!(s && s.matchToRom && s.romMatchAddr); } catch (e) { return false; }
          }, col);
          if (colHas) return true;
        }
        await page.waitForTimeout(interval);
        continue;
      }

      // Fallback: sample canvas pixels in a single, concise evaluate
      const blackCount = await page.evaluate(() => {
        try {
          const canvas = document.getElementById('screen'); if (!canvas) return 0;
          const ctx = canvas.getContext('2d'); const x = 16; const y = 190; const d = ctx.getImageData(x, y, 32, 8).data;
          let black = 0; for (let p = 0; p < d.length; p += 4) if ((d[p] + d[p+1] + d[p+2]) < 150) black++;
          return black;
        } catch (e) { return 0; }
      });

      if (blackCount > 15) return true;
      await page.waitForTimeout(interval);
    }
    return false;
  }

  test('CHARS pointer and ROM contain glyph', async ({ page }) => {
    const charsOk = await waitForChars(page);
    expect(charsOk).toBe(true);
  });

  test('© glyph should appear via auto-backfill when ROM/CHARS present', async ({ page }) => {
    // Guarantee CHARS/ROM presence first (fail early if not present)
    const ready = await waitForChars(page);
    expect(ready).toBe(true);

    const hasGlyph = await waitForGlyph(page);
    expect(hasGlyph).toBe(true);
  });
});
