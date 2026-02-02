import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../tests/_helpers/bootHelpers.mjs';

test('Dump CHARS pointer and ROM glyph bytes for 0x7F', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  const diag = await page.evaluate(() => {
    const emu = window.emulator || window.emu;
    if (!emu || !emu.memory) return {};
    const charsPtr = (emu.memory.read(0x5C36) | (emu.memory.read(0x5C37) << 8));
    const glyphAddr = (charsPtr * 8) + 0x3C00 + (0x7F * 8);
    const glyph = [];
    for (let i = 0; i < 8; i++) glyph.push(emu.memory.read(glyphAddr + i));
    return { charsPtr, glyph };
  });

  expect(diag.charsPtr).toBeDefined();
  expect(Array.isArray(diag.glyph)).toBe(true);
});
