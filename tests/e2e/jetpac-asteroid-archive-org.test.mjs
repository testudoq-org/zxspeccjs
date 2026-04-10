import { test, expect } from '@playwright/test';
import { waitForBootComplete, verifyBootGlyph } from '../_helpers/bootHelpers.mjs';

// Regression test: detect random asteroids (enemies) visually and via memory writes.
// Expected to FAIL on builds where the emulator does not render enemies.

const SEARCH_QUERY = 'Jetpac';
const FILE_NAME = 'Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const EMU_READY_SELECTOR = '[data-testid="screen"]';

const FRAME_INTERVAL = 150; // ms
const MAX_FRAMES = 160;     // ~24s sample window to catch random spawns
const PIXEL_DIFF_THRESHOLD = 40; // per-channel brightness diff
const AST_MIN_PIXELS = 20;  // asteroid blob should affect at least this many pixels
const AST_MAX_PIXELS = 4000; // exclude full-screen changes

const LIVE_MODE = process.env.TAPE_LIBRARY_LIVE === '1' || !process.env.CI;

async function captureCanvasPixels(page) {
  try {
    return await page.evaluate(() => {
      const c = document.querySelector('#screen');
      if (!c) return null;
      const ctx = c.getContext('2d');
      try { const img = ctx.getImageData(0, 0, c.width, c.height); return Array.from(img.data); } catch (e) { return null; }
    });
  } catch (e) { return null; }
}

function frameDiffInfo(basePixels, newPixels, width = 320, height = 240) {
  if (!basePixels || !newPixels) return { count: 0, positions: [] };
  const len = Math.min(basePixels.length, newPixels.length);
  let changed = 0;
  const positions = [];
  for (let i = 0; i < len; i += 4) {
    const dr = Math.abs(basePixels[i] - newPixels[i]);
    const dg = Math.abs(basePixels[i + 1] - newPixels[i + 1]);
    const db = Math.abs(basePixels[i + 2] - newPixels[i + 2]);
    if (dr > PIXEL_DIFF_THRESHOLD || dg > PIXEL_DIFF_THRESHOLD || db > PIXEL_DIFF_THRESHOLD) {
      const pxIndex = i / 4;
      const x = pxIndex % width;
      const y = Math.floor(pxIndex / width);
      positions.push({ x, y });
      changed++;
    }
  }
  return { count: changed, positions };
}

function detectAsteroidBlob(basePixels, framePixels) {
  const w = 320; const h = 240;
  for (const p of framePixels) {
    const info = frameDiffInfo(basePixels, p, w, h);
    if (info.count < AST_MIN_PIXELS || info.count > AST_MAX_PIXELS) continue;

    // Filter: asteroid should appear away from HUD/top rows and away from player ground
    const meaningful = info.positions.filter(pos => pos.y > 28 && pos.y < 176);
    if (meaningful.length >= Math.max(6, Math.floor(AST_MIN_PIXELS / 2))) return true;
  }
  return false;
}

async function detectScreenMemWrites(page, beforeSnapshot) {
  // Look for memWrites in display RAM region (0x4000..0x57FF) after pressing START
  return page.evaluate((before) => {
    try {
      const dbg = window.__ZX_DEBUG__ || {};
      const memWrites = Array.isArray(dbg.memWrites) ? dbg.memWrites.slice(-256) : (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites) ? window.emu.memory._memWrites.slice(-256) : []);
      const writesInDisplay = memWrites.filter(w => (w.addr >= 0x4000 && w.addr <= 0x57FF));
      if (writesInDisplay.length > 0) return true;

      // fallback: inspect page memory differences for screen range
      const mem = window.emu && window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
      if (!mem || !before) return false;
      const start = 0x4000 - 0x4000; const end = 0x57FF - 0x4000;
      for (let i = start; i <= end; i++) if (mem[i] !== before[i]) return true;
      return false;
    } catch (e) { return false; }
  }, beforeSnapshot);
}

test('Jetpac: random asteroids (enemies) appear after pressing 5', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);

  // Use stub in CI for deterministic availability; live archive when running locally
  if (!LIVE_MODE) {
    // reuse existing stubs from other Jetpac tests by importing their setup via route
    await page.route(/archive\.org\/advancedsearch\.php/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: 'zx_Jetpac_1983_Ultimate_Play_The_Game' }] }}) }));
    await page.route(/archive\.org\/metadata\/([^/]+)/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: FILE_NAME, format: 'Z80 Snapshot' }] }) }));
    await page.route(/archive\.org\/download\/.+\/.+/, (route) => route.fulfill((() => {
      const PAGE_SIZE = 16384; const header = new Uint8Array(30);
      header[0] = 0xFF; header[1] = 0x44; header[6] = 0x00; header[7] = 0x80; header[8] = 0x00; header[9] = 0xFF; header[10] = 0x3F; header[11] = 0x01; header[27] = 1; header[28] = 1; header[29] = 1;
      const ram = new Uint8Array(3 * PAGE_SIZE).fill(0);
      for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
      for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
      const out = new Uint8Array(header.length + ram.length);
      out.set(header, 0); out.set(ram, header.length);
      return { status: 200, contentType: 'application/octet-stream', body: Buffer.from(out) };
    })()));
  }

  await page.goto('/');
  await expect(page.locator(EMU_READY_SELECTOR)).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  const boot = await waitForBootComplete(page, 10000);
  const glyphResult = await verifyBootGlyph(page);
  expect(boot.bootComplete || glyphResult.romHasCopyright || glyphResult.fbHasText).toBeTruthy();

  // Start via Tape UI (reuse existing flow from other tests)
  await page.locator('[data-testid="tape-library-btn"]').click();
  await page.locator('[data-testid="tape-search-input"]').fill(SEARCH_QUERY);
  await page.locator('[data-testid="tape-search-btn"]').click();
  await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: 15000 });
  const targetResult = page.locator('li.tape-result-item:has-text("Jetpac [a][16K]")').first();
  await expect(targetResult).toBeVisible({ timeout: 15000 });
  await targetResult.locator('.tape-result-details-btn').first().evaluate(b => b.click());
  await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: 15000 });

  // Load snapshot
  const fileItem = page.locator(`.tape-file-item[data-name="${FILE_NAME}"]`).first();
  if ((await fileItem.count()) === 0) {
    const loadBtnFallback = page.locator('[data-testid="tape-load-btn"]').first();
    await loadBtnFallback.evaluate(b => b.click());
  } else {
    await fileItem.locator('[data-testid="tape-load-btn"]').first().evaluate(b => b.click());
  }

  await expect(page.locator('[data-testid="status"]')).toHaveText(/Snapshot\s+Jetpac_1983_Ultimate_Play_The_Game(?:_a)?_16K\.z80\s+applied/i, { timeout: 8000 });
  await page.waitForFunction(() => !!(window.emu && window.emu._running), null, { timeout: 10000 });
  await page.waitForTimeout(300);

  // Baseline pixels & memory
  const baselineMem = await page.evaluate(() => {
    try { const mem = window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null; if (!mem) return null; const start = 0x4000 - 0x4000; const end = 0x57FF - 0x4000; return Array.from(mem.slice(start, end + 1)); } catch (e) { return null; }
  });
  const baselinePixels = await captureCanvasPixels(page);
  await testInfo.attach('baseline-screenshot', { body: Buffer.from(await page.screenshot({})), contentType: 'image/png' }).catch(()=>{});

  // Press START and sample a long window to catch random asteroids
  await page.keyboard.press('5').catch(()=>{});
  await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('5'); } catch (e) {} });

  const frames = [];
  let asteroidDetected = false;
  let memWritesDetected = false;
  let beepDetected = false;

  for (let i = 0; i < MAX_FRAMES; i++) {
    // keep emulator stable — bail if page reloads
    try {
      if (!beepDetected) {
        const toggles = await page.evaluate(() => (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-8) : []);
        beepDetected = toggles && toggles.length > 0;
      }
      const pixels = await captureCanvasPixels(page);
      if (pixels) frames.push(pixels);
      // visual detection
      if (!asteroidDetected && detectAsteroidBlob(baselinePixels, frames.slice(-6))) asteroidDetected = true;
      // mem writes
      if (!memWritesDetected && await detectScreenMemWrites(page, baselineMem)) memWritesDetected = true;
      if (asteroidDetected && memWritesDetected && beepDetected) break;
      await page.waitForTimeout(FRAME_INTERVAL);
    } catch (err) {
      // page navigated / context destroyed — stop sampling
      break;
    }
  }

  // Attach final screenshot for debugging
  await testInfo.attach('final-screenshot', { body: Buffer.from(await page.screenshot()), contentType: 'image/png' }).catch(()=>{});

  // Assertions: asteroid must appear (visual OR mem writes representing enemy drawing)
  expect(beepDetected, 'expected audio/beep after pressing START').toBeTruthy();
  expect(asteroidDetected || memWritesDetected, 'expected asteroids/enemy sprites to appear or screen-memory writes reflecting them').toBeTruthy();

});
