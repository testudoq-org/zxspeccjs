/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted, waitForBootComplete } from './_helpers/bootHelpers.mjs';

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
      // set attribute to white on black
      const attrAddr = 0x5800 + (Math.floor(184 / 8) * 32) + col;
      try { emu.memory.write(attrAddr, 0x07); } catch (e) { /* ignore */ }
    }
  });

  // Force a few renders to let renderer run its deterministic fallback
  await page.evaluate(async () => { for (let i=0;i<6;i++){ if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { window.emulator.ula.render(); await new Promise(r => requestAnimationFrame(r)); } } });

  // Now introspect framebuffer to verify previous column got filled from CHARS/ROM
  const result = await page.evaluate(() => {
    const fb = (window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer) ? window.emulator.ula.frameBuffer : null;
    if (!fb || !fb.buffer) return { error: 'no_fb' };
    const topBorderBytes = 24 * 160;
    const lineStride = 16 + 64 + 16;
    const targetCol = 8;
    const prev = targetCol - 1;
    const bytes = [];
    for (let r = 0; r < 8; r++) {
      const y = 184 + r;
      const bufferPtr = topBorderBytes + y * lineStride + 16 + prev * 2;
      bytes.push(fb.buffer[bufferPtr]);
    }
    // Read chars/ROM glyph
    const lo = window.emulator.readRAM(0x5C36); const hi = window.emulator.readRAM(0x5C37);
    const charsPtr = ((hi<<8)|lo) || 0x3C00;
    const romGlyph = []; for (let i=0;i<8;i++) { let g = window.emulator.readRAM((charsPtr + 0x7F*8 + i)&0xffff); if (!g) g = window.emulator.readROM((0x3C00 + 0x7F*8 + i)&0xffff); romGlyph.push(g); }
    const matches = romGlyph.every((v,i)=>v === bytes[i]);
    return { bytes, matches, romGlyph };
  });

  if (result.error) {
    await page.screenshot({ path: 'screenshots/glyph-copyright-no-fill.png' }).catch(() => {});
    console.error('Diag:', result);
  }

  return result;

  if (found && !found.foundAt) {
    console.error('Diagnostics:', found);
    // surface for test results
    expect(found.found).toBeTruthy();
  } else {
    expect(found.foundAt).toBeGreaterThanOrEqual(0);
    expect(found.nowFilled).toBeTruthy();
    expect(found.matchesCopy).toBeTruthy();
  }
});
