/* eslint-env browser, node, es2021 */
/* global window document console */

import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from './_helpers/bootHelpers.mjs';

test('Dump CHARS pointer and glyph bytes for 0x7F from ROM/CHARS', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  const diag = await page.evaluate(() => {
    const dbg = window.__ZX_DEBUG__;
    if (!dbg || typeof dbg.peekMemory !== 'function') return { error: 'no_debug' };

    const chars = dbg.peekMemory(0x5C36, 2);
    const charsPtr = (chars && chars[1] !== undefined) ? ((chars[1] << 8) | chars[0]) : 0;
    const romDump = [];
    const romRegion = 0x3C00 + (0x7F * 8);
    for (let i = 0; i < 8; i++) {
      let vRam = null;
      try { vRam = dbg.peekMemory((charsPtr + 0x7F*8 + i) & 0xffff, 1)[0]; } catch (e) { vRam = null; }
      let vRom = null;
      try { vRom = dbg.readROM((0x3C00 + 0x7F*8 + i) & 0xffff); } catch (e) { vRom = null; }
      romDump.push({ i, vRam, vRom });
    }
    return { charsPtr, romDump };
  });

  expect(diag).toBeTruthy();
  expect(diag.charsPtr).toBeGreaterThanOrEqual(0);
  // ensure at least one glyph byte is non-null in ROM
  const any = diag.romDump.some(d => d.vRom !== null && d.vRom !== undefined);
  expect(any).toBe(true);
});
