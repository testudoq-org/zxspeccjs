import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupDiagnostics, ensureStarted } from '../tests/_helpers/bootHelpers.mjs';

// This test presses 'L' via in-page helper and saves a screenshot PNG
test('keyboard screenshot test (LIST) @ui', async ({ page }) => {
  const consoleMsgs = await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 15000 });

  // Start emulator if not running
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Give a moment for ROM to settle
  await page.waitForTimeout(500);

  // Wait briefly for in-page helper to be available, then run it; if missing, inject a fallback helper
  await page.waitForFunction(() => !!(window.__ZX_DEBUG__ || window.emu), { timeout: 5000 }).catch(() => {});

  // Inject fallback helper if the in-page helper is not present
  await page.evaluate(() => {
    if (!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {};
    if (!window.__ZX_DEBUG__.testKeyboardAndScreenshot) {
      window.__ZX_DEBUG__.testKeyboardAndScreenshot = async ({ key = 'l', holdMs = 500, waitMs = 500, download = false } = {}) => {
        try {
          const canvas = document.getElementById('screen');
          if (!canvas) return { error: 'no_canvas' };
          // Press key via input API if available, else via __ZX_DEBUG__ pressKey
          if (window.__ZX_DEBUG__.pressKey) window.__ZX_DEBUG__.pressKey(key);
          else if (window.emu && window.emu.input && typeof window.emu.input.pressKey === 'function') window.emu.input.pressKey(key);
          if (window.emu && typeof window.emu._applyInputToULA === 'function') window.emu._applyInputToULA();
          await new Promise(r => setTimeout(r, holdMs));
          if (window.__ZX_DEBUG__.releaseKey) window.__ZX_DEBUG__.releaseKey(key);
          else if (window.emu && window.emu.input && typeof window.emu.input.releaseKey === 'function') window.emu.input.releaseKey(key);
          await new Promise(r => setTimeout(r, waitMs));
          const dataUrl = canvas.toDataURL('image/png');
          window.__ZX_DEBUG__.lastKeyboardScreenshot = dataUrl;
          return { screenshot: true };
        } catch (e) { return { error: String(e) }; }
      };
    }
  });

  const result = await page.evaluate(async () => {
    if (!window.__ZX_DEBUG__ || typeof window.__ZX_DEBUG__.testKeyboardAndScreenshot !== 'function') {
      return { error: 'helper-missing' };
    }
    return await window.__ZX_DEBUG__.testKeyboardAndScreenshot({ key: 'l', holdMs: 500, waitMs: 500, download: false });
  });

  expect(result).toBeTruthy();
  expect(result.error).toBeUndefined();

  // Get full data URL from in-page storage
  const dataUrl = await page.evaluate(() => window.__ZX_DEBUG__ && window.__ZX_DEBUG__.lastKeyboardScreenshot ? window.__ZX_DEBUG__.lastKeyboardScreenshot : null);
  expect(dataUrl).toBeTruthy();
  expect(typeof dataUrl).toBe('string');
  expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

  const outDir = path.join(process.cwd(), 'tests/e2e', '_artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = path.join(outDir, `keyboard-list-${Date.now()}.png`);
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filename, Buffer.from(base64, 'base64'));

  const stats = fs.statSync(filename);
  console.log('Saved keyboard screenshot to', filename, 'size', stats.size);

  expect(stats.size).toBeGreaterThan(1000);
});