import { test, expect } from '@playwright/test';
import { waitForBootComplete, verifyBootGlyph } from '../_helpers/bootHelpers.mjs';

// Regression test: Jetpac must spawn enemies/rocket-parts and allow firing bullets
// This test is expected to FAIL on current emulator builds where dynamic objects
// (asteroids / rocket parts / bullets) are missing after pressing '5'.

const SEARCH_QUERY = 'Jetpac';
const FILE_NAME = 'Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const EMU_READY_SELECTOR = '[data-testid="screen"]';

const FRAME_INTERVAL = 150; // ms
const MAX_FRAMES = 120;     // sample ~18s (long to observe slow spawns)
const PIXEL_DIFF_THRESHOLD = 40;
const MIN_BLOB_PIXELS = 6;

const LIVE_MODE = process.env.TAPE_LIBRARY_LIVE === '1' || !process.env.CI;

// --- helpers (self-contained copy of detection logic) ---
async function captureCanvasPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#screen');
    if (!c) return null;
    const ctx = c.getContext('2d');
    try { const img = ctx.getImageData(0, 0, c.width, c.height); return Array.from(img.data); } catch (e) { return null; }
  });
}

function frameDiffCount(basePixels, newPixels) {
  if (!basePixels || !newPixels) return 0;
  const len = Math.min(basePixels.length, newPixels.length);
  let changed = 0;
  for (let i = 0; i < len; i += 4) {
    const dr = Math.abs(basePixels[i] - newPixels[i]);
    const dg = Math.abs(basePixels[i + 1] - newPixels[i + 1]);
    const db = Math.abs(basePixels[i + 2] - newPixels[i + 2]);
    if (dr > PIXEL_DIFF_THRESHOLD || dg > PIXEL_DIFF_THRESHOLD || db > PIXEL_DIFF_THRESHOLD) changed++;
  }
  return changed;
}

function detectMovingBlob(basePixels, framesPixels) {
  for (const p of framesPixels) {
    const changed = frameDiffCount(basePixels, p);
    if (changed >= MIN_BLOB_PIXELS && changed < 2000) return true;
  }
  return false;
}

async function detectRocketMemoryWrites(page, beforeSnapshot) {
  // check page memory first, then debug-write logs as fallback
  const pageCheck = await page.evaluate((before) => {
    try {
      const mem = window.emu && window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
      if (!mem) return false;
      const start = 0x4800 - 0x4000; const end = 0x49FF - 0x4000;
      for (let i = start; i <= end; i++) {
        const b = mem[i];
        if (before && before[i] !== undefined) {
          if (b !== before[i]) return true;
        } else {
          if (b !== 0) return true;
        }
      }
      return false;
    } catch (e) { return false; }
  }, beforeSnapshot);

  if (pageCheck) return true;

  const dbg = await page.evaluate(() => {
    try {
      const rocket = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites)) ? window.__ZX_DEBUG__.rocketWrites.slice(-8) : [];
      const memWrites = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-32) : [];
      const hasRocketWrites = rocket.length > 0;
      const hasMemWritesInRange = memWrites.some(w => (w.addr >= 0x4800 && w.addr <= 0x49FF));
      return { hasRocketWrites, hasMemWritesInRange };
    } catch (e) { return { hasRocketWrites: false, hasMemWritesInRange: false }; }
  });

  return dbg.hasRocketWrites || dbg.hasMemWritesInRange;
}

async function detectBeepViaToggles(page, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const evidence = await page.evaluate(() => {
      try {
        const toggles = (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-8) : [];
        const dbgPortWrites = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites)) ? window.__ZX_DEBUG__.portWrites.slice(-8) : [];
        const hasPortFE = dbgPortWrites.some(p => (p.port & 0xff) === 0xfe);
        return { toggles, hasPortFE };
      } catch (e) { return { toggles: [], hasPortFE: false }; }
    });

    if ((evidence.toggles && evidence.toggles.length > 0) || evidence.hasPortFE) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// Reuse the tape UI stub used by other Jetpac E2E tests (keeps test runnable in CI)
async function setupStubs(page) {
  const FILE = FILE_NAME;
  const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
  const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
  const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/.+/;
  await page.route(SEARCH_URL_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: 'zx_Jetpac_1983_Ultimate_Play_The_Game' }] }}) }));
  await page.route(METADATA_URL_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: FILE, format: 'Z80 Snapshot' }] }) }));
  // Minimal .z80 payload — same as other tests (CI-friendly)
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, (route) => route.fulfill((() => {
    const PAGE_SIZE = 16384;
    const header = new Uint8Array(30);
    header[0] = 0xFF; header[1] = 0x44; header[6] = 0x00; header[7] = 0x80; header[8] = 0x00; header[9] = 0xFF; header[10] = 0x3F; header[11] = 0x01; header[27] = 1; header[28] = 1; header[29] = 1;
    const ram = new Uint8Array(3 * PAGE_SIZE).fill(0);
    for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
    for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
    const out = new Uint8Array(header.length + ram.length);
    out.set(header, 0); out.set(ram, header.length);
    return { status: 200, contentType: 'application/octet-stream', body: Buffer.from(out) };
  })()));
}

// --- Test ---
test('Jetpac: enemies, rocket-parts and bullets appear after pressing 5 (regression)', async ({ page }, testInfo) => {
  testInfo.setTimeout(90000);

  if (!LIVE_MODE) await setupStubs(page);

  await page.goto('/');
  await expect(page.locator(EMU_READY_SELECTOR)).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  const boot = await waitForBootComplete(page, 10000);
  const glyphResult = await verifyBootGlyph(page);
  expect(boot.bootComplete || glyphResult.romHasCopyright || glyphResult.fbHasText).toBeTruthy();

  // Open tape library and search
  await page.locator('[data-testid="tape-library-btn"]').click();
  const searchInput = page.locator('[data-testid="tape-search-input"]');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(SEARCH_QUERY);
  await page.locator('[data-testid="tape-search-btn"]').click();

  await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: 15000 });
  const targetResult = page.locator('li.tape-result-item:has-text("Jetpac [a][16K]")').first();
  await expect(targetResult).toBeVisible({ timeout: 15000 });
  const detailsBtn = targetResult.locator('.tape-result-details-btn, [data-testid="tape-result-details-btn"]').first();
  await detailsBtn.evaluate(b => b.click());
  await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: 15000 });

  // Load snapshot
  const fileItem = page.locator(`.tape-file-item[data-name="${FILE_NAME}"]`).first();
  if ((await fileItem.count()) === 0) {
    const loadBtnFallback = page.locator('[data-testid="tape-load-btn"]').first();
    await expect(loadBtnFallback).toBeVisible({ timeout: 15000 });
    await loadBtnFallback.evaluate(b => b.click());
  } else {
    const loadBtn = fileItem.locator('[data-testid="tape-load-btn"]');
    await expect(loadBtn).toBeVisible({ timeout: 15000 });
    await loadBtn.evaluate(b => b.click());
  }

  // Wait for snapshot to be applied (or emulator running with snapshot diagnostics)
  const statusEl = page.locator('[data-testid="status"]');
  await page.waitForFunction(() => {
    try {
      const s = document.querySelector('[data-testid="status"]')?.textContent || '';
      const applied = /Snapshot\s+Jetpac_1983_Ultimate_Play_The_Game(?:_a)?_16K\.z80\s+applied/i.test(s);
      const runningWithDiag = (!!(window.emu && window.emu._running) && !!(window.__TEST__ && window.__TEST__.snapshotDiag));
      return applied || runningWithDiag;
    } catch (e) { return false; }
  }, null, { timeout: 10000 });
  // small settling time for frames
  await page.waitForTimeout(300);

  // Baseline canvas + rocket memory
  const baselineMem = await page.evaluate(() => {
    try { const mem = window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null; if (!mem) return null; const start = 0x4800 - 0x4000; const end = 0x49FF - 0x4000; return Array.from(mem.slice(start, end + 1)); } catch (e) { return null; }
  });
  const baselinePixels = await captureCanvasPixels(page);
  await testInfo.attach('baseline-screenshot', { body: Buffer.from(await page.screenshot({})), contentType: 'image/png' }).catch(() => {});

  // Press START (5)
  await page.keyboard.press('5').catch(() => {});
  await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('5'); } catch (e) {} });

  // Capture short CPU/memory timeline after pressing START for debugging
  const startTimeline = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 50; i++) {
      try {
        const cpu = window.emu && window.emu.cpu ? { PC: window.emu.cpu.PC, R: window.emu.cpu.R, tstates: window.emu.cpu.tstates } : null;
        const micro = (window.emu && window.emu.cpu && Array.isArray(window.emu.cpu._microLog)) ? window.emu.cpu._microLog.slice(-128) : null;
        const memWrites = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites)) ? window.__ZX_DEBUG__.rocketWrites.slice(-16) : (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites) ? window.emu.memory._memWrites.slice(-16) : []);
        const contention = (window.emu && window.emu.memory && typeof window.emu.memory.getContentionLog === 'function') ? window.emu.memory.getContentionLog().slice(-8) : (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.contentionLog ? window.__ZX_DEBUG__.contentionLog.slice(-8) : []);
        samples.push({ ts: Date.now(), cpu, memWrites, contention });
      } catch (e) { samples.push({ ts: Date.now(), error: String(e) }); }
      await new Promise(r => setTimeout(r, 20));
    }
    return samples;
  });
  await testInfo.attach('post-start-timeline.json', { body: JSON.stringify(startTimeline, null, 2), contentType: 'application/json' });
  // eslint-disable-next-line no-console
  console.log('POST-START-TIMELINE-SAMPLE:', JSON.stringify(startTimeline.slice(0,8)) );

  // Collect frames and memWrites to detect enemies/rocket parts
  const frames = [];
  let enemyDetected = false;
  let rocketDetected = false;
  let beepDetected = false;

  for (let i = 0; i < MAX_FRAMES; i++) {
    if (!beepDetected) beepDetected = await detectBeepViaToggles(page, 200);
    const pixels = await captureCanvasPixels(page);
    frames.push(pixels);
    if (!rocketDetected) rocketDetected = await detectRocketMemoryWrites(page, baselineMem);
    if (!enemyDetected) enemyDetected = detectMovingBlob(baselinePixels, [pixels]);
    if (enemyDetected && rocketDetected && beepDetected) break;
    await page.waitForTimeout(FRAME_INTERVAL);
  }

  // Now check firing: press Space and expect a bullet to appear (small moving blob)
  const beforeFireFrames = frames.slice(-6);
  await page.keyboard.press('Space').catch(() => {});
  await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('space'); setTimeout(()=>{ if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.releaseKey === 'function') window.__ZX_DEBUG__.releaseKey('space'); }, 120);} catch(e){} });

  const fireFrames = [];
  let bulletDetected = false;
  for (let i = 0; i < 40; i++) {
    const p = await captureCanvasPixels(page);
    fireFrames.push(p);
    if (!bulletDetected && detectMovingBlob(beforeFireFrames[0] || baselinePixels, [p])) bulletDetected = true;
    await page.waitForTimeout(FRAME_INTERVAL);
  }

  // Attach frames for debugging
  for (let i = 0; i < Math.min(6, frames.length); i++) {
    try { await testInfo.attach(`frame-${i}`, { body: Buffer.from(await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 240 } })), contentType: 'image/png' }); } catch (e) { /* ignore */ }
  }

  // Final assertions: we EXPECT enemies & rocket parts & bullets — this test documents the bug when any are missing
  expect(beepDetected, 'expected audio/beep after pressing START').toBeTruthy();
  expect(enemyDetected, 'expected asteroids/enemies to appear after pressing 5').toBeTruthy();
  expect(rocketDetected, 'expected rocket parts / platform writes (0x4800..0x49FF) after pressing 5').toBeTruthy();
  expect(bulletDetected, 'expected pressing Space to fire a bullet (visual change)').toBeTruthy();

});
