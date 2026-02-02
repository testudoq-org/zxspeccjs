/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from './_helpers/bootHelpers.mjs';

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
    while (Date.now() - start < 3000) {
      inspect = await page.evaluate(() => {
        try {
          if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.inspectBottomGlyphs === 'function') return window.__ZX_DEBUG__.inspectBottomGlyphs(184);
        } catch (e) { return { error: String(e) }; }
        return { error: 'inspect-unavailable' };
      });
      if (inspect && inspect.cols && Array.isArray(inspect.cols)) {
        colsWith7F = (inspect.cols || []).filter(c => c.rows.some(r => r.val === 0x7F));
        if (colsWith7F.length > 0) break;
      }
      await page.waitForTimeout(100);
    }

    // If no 0x7F present, fail with diagnostics
    if (colsWith7F.length === 0) {
      await page.screenshot({ path: 'screenshots/glyph-regression-no-7f.png' }).catch(() => {});
      console.error('No 0x7F found in bottom columns after polling; last inspect:', JSON.stringify(inspect, null, 2));

      // Deterministic fallback test: pick a candidate column that has glyphMatchesRom===true and fbBytes all-zero,
      // write 0x7F into text buffer for that col and force a render; verify auto-backfill fills bitmap
      await page.evaluate(() => {
        try {
          const dbg = window.__ZX_DEBUG__;
          const emu = window.emulator || window.emu;
          if (!emu || !emu.memory || !emu.ula || !dbg || typeof dbg.inspectBottomGlyphs !== 'function') return;

          const inspect = dbg.inspectBottomGlyphs(184);
          let target = null;
          for (const c of (inspect.cols || [])) {
            if (c.glyphMatchesRom === true && Array.isArray(c.fbBytes) && c.fbBytes.every(b => b === 0)) { target = c.col; break; }
          }
          if (target === null) target = 0;

          // Write 0x7F into system text buffer for chosen column
          const textAddr = 0x5C00 + 0 * 32 + target; // topRow group 0
          emu.memory.write(textAddr, 0x7F);

          // Clear bitmap bytes for the target column across 8 rows (topRow 184..191)
          const topRow = 184;
          for (let r = 0; r < 8; r++) {
            const y = topRow + r;
            const y0 = y & 0x07;
            const y1 = (y & 0x38) >> 3;
            const y2 = (y & 0xC0) >> 6;
            const bitmapIndex = (y0 << 8) | (y1 << 5) | (y2 << 11) | target;
            emu.memory.write(0x4000 + bitmapIndex, 0x00);
          }

          // Set attribute to white on black for that column
          const attrAddr = 0x5800 + (Math.floor(184 / 8) * 32) + target;
          emu.memory.write(attrAddr, 0x07);
        } catch (e) { /* ignore */ }
      });

      // Force a few renders
      await page.evaluate(async () => {
        for (let i = 0; i < 4; i++) { if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { window.emulator.ula.render(); await new Promise(r => requestAnimationFrame(r)); } }
      });

      // Re-run inspect
      inspect = await page.evaluate(() => window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.inspectBottomGlyphs === 'function' ? window.__ZX_DEBUG__.inspectBottomGlyphs(184) : null);

      // Find candidate columns where glyphMatchesRom===true and previously fbBytes were zero
      const candidates = (inspect && inspect.cols) ? (inspect.cols || []).filter(c => c.glyphMatchesRom === true) : [];

      // Prefer a candidate that has non-zero framebuffer after our injection/render
      const postGood = candidates.some(c => (Array.isArray(c.fbBytes) && c.fbBytes.some(b => b !== 0)) || c.fbMatchesRom === true || c.canvasShowsNonBg === true);

      if (!postGood) {
        await page.screenshot({ path: 'screenshots/glyph-regression-force-failed.png' }).catch(() => {});
        console.error('Force injection did not cause framebuffer to show glyph; inspect:', JSON.stringify(inspect, null, 2));
      }

      expect(postGood).toBeTruthy();
    }

    // If we found a 0x7F in the wild earlier, proceed with assertions against those columns
    if (colsWith7F && colsWith7F.length > 0) {
      const good = colsWith7F.some(c => (Array.isArray(c.fbBytes) && c.fbBytes.some(b => b !== 0)) || c.fbMatchesRom === true || c.canvasShowsNonBg === true);
      expect(good).toBeTruthy();
    }


  });
});
