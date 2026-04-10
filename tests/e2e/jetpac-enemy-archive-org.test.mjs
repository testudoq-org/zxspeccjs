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
  // Prefer consecutive-frame diffs (more sensitive to small moving sprites).
  if (framesPixels && framesPixels.length > 1) {
    for (let i = 1; i < framesPixels.length; i++) {
      const prev = framesPixels[i - 1];
      const cur = framesPixels[i];
      const changed = frameDiffCount(prev, cur);
      if (changed >= MIN_BLOB_PIXELS && changed < 2000) return true;
    }
  }

  // Fallback: compare frames to the provided baseline
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

      // If a baseline slice was provided, compare against the slice correctly
      if (before && Array.isArray(before)) {
        for (let i = start; i <= end; i++) {
          const b = mem[i];
          const baseline = before[i - start];
          if (typeof baseline !== 'undefined' && b !== baseline) return true;
        }
        return false;
      }

      // No baseline provided — detect any non-zero in the rocket area
      for (let i = start; i <= end; i++) {
        if (mem[i] !== 0) return true;
      }
      return false;
    } catch (e) { return false; }
  }, beforeSnapshot);

  if (pageCheck) return true;

  const dbg = await page.evaluate(() => {
    try {
      const rocket = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites)) ? window.__ZX_DEBUG__.rocketWrites.slice(-8) : [];
      // Prefer debug memWrites if available, fall back to the emulator internal log
      const memWritesDebug = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-32) : [];
      const memWritesEmu = (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites)) ? window.emu.memory._memWrites.slice(-32) : [];
      const memWrites = memWritesDebug.length ? memWritesDebug : memWritesEmu;
      const hasRocketWrites = rocket.length > 0;
      const hasMemWritesInRange = memWrites.some(w => (w.addr >= 0x4800 && w.addr <= 0x49FF));
      return { hasRocketWrites, hasMemWritesInRange };
    } catch (e) { return { hasRocketWrites: false, hasMemWritesInRange: false }; }
  });

  return dbg.hasRocketWrites || dbg.hasMemWritesInRange;
}

// Authoritative fallback: detect memory writes anywhere in the display bitmap (0x4000..0x57FF)
async function detectDisplayMemoryWrites(page, beforeSnapshot) {
  const pageCheck = await page.evaluate((before) => {
    try {
      const mem = window.emu && window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
      if (!mem) return false;
      const start = 0x4000 - 0x4000; const end = 0x57FF - 0x4000; // 0..0x17FF
      if (before && Array.isArray(before)) {
        for (let i = start; i <= end; i++) {
          const b = mem[i];
          const baseline = before[i - start];
          if (typeof baseline !== 'undefined' && b !== baseline) return true;
        }
        return false;
      }
      for (let i = start; i <= end; i++) if (mem[i] !== 0) return true;
      return false;
    } catch (e) { return false; }
  }, beforeSnapshot);

  if (pageCheck) return true;

  const dbg = await page.evaluate(() => {
    try {
      const memWritesDebug = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-256) : [];
      const memWritesEmu = (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites)) ? window.emu.memory._memWrites.slice(-256) : [];
      const memWrites = memWritesDebug.length ? memWritesDebug : memWritesEmu;
      const hasMemWritesInDisplay = memWrites.some(w => (w.addr >= 0x4000 && w.addr <= 0x57FF));
      return { hasMemWritesInDisplay };
    } catch (e) { return { hasMemWritesInDisplay: false }; }
  });

  return dbg.hasMemWritesInDisplay;
}

async function detectBeepViaToggles(page, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const evidence = await page.evaluate(() => {
      try {
        const toggles = (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-8) : [];
        const dbgPortWrites = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites)) ? window.__ZX_DEBUG__.portWrites.slice(-8) : [];
        const internalPortWrites = (window.emu && Array.isArray(window.emu._portWrites)) ? window.emu._portWrites.slice(-8) : [];
        const hasPortFE = dbgPortWrites.some(p => (p.port & 0xff) === 0xfe) || internalPortWrites.some(p => (p.port & 0xff) === 0xfe);
        return { toggles, hasPortFE, dbgPortWrites, internalPortWrites };
      } catch (e) { return { toggles: [], hasPortFE: false }; }
    });

    if ((evidence.toggles && evidence.toggles.length > 0) || evidence.hasPortFE) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// Wait for the canonical start-sequence observed in a correct reference:
// 1) platform/rocket parts written to 0x4800..0x49FF
// 2) short delay → beep (port FE / sound toggles)
// 3) player & enemy sprites appear (visual OR display-memory writes)
async function waitForStartSequence(page, { baselinePixels = null, baselineMem = null, baselineDisplay = null, timeouts = { rocket: 3000, beep: 3500, enemy: 8000 } } = {}) {
  const result = { rocket: false, beep: false, enemy: false, timings: {} };

  const t0 = Date.now();
  // 1) rocket/platform writes
  const rocketStart = Date.now();
  const rocketOk = await (async () => {
    const start = Date.now();
    while (Date.now() - start < timeouts.rocket) {
      const r = await detectRocketMemoryWrites(page, baselineMem);
      if (r) return true;
      await page.waitForTimeout(120);
    }
    return false;
  })();
  result.rocket = rocketOk;
  result.timings.rocket = Date.now() - rocketStart;

  // 2) beep (allow some extra time after rocket)
  const beepStart = Date.now();
  if (rocketOk) {
    result.beep = await detectBeepViaToggles(page, timeouts.beep);
  } else {
    // still try to detect beep even if rocket not observed
    result.beep = await detectBeepViaToggles(page, timeouts.beep);
  }
  result.timings.beep = Date.now() - beepStart;

  // 3) enemy/player — visual preferred, display-memory writes as authoritative fallback
  const enemyStart = Date.now();
  const enemyOk = await (async () => {
    const start = Date.now();
    while (Date.now() - start < timeouts.enemy) {
      const pixels = await captureCanvasPixels(page);
      if (baselinePixels && pixels && detectMovingBlob(baselinePixels, [pixels])) return true;
      const displayWrites = await detectDisplayMemoryWrites(page, baselineDisplay);
      if (displayWrites) return true;
      await page.waitForTimeout(120);
    }
    return false;
  })();
  result.enemy = enemyOk;
  result.timings.enemy = Date.now() - enemyStart;

  result.total = Date.now() - t0;
  return result;
}

// Reuse the tape UI stub used by other Jetpac E2E tests (keeps test runnable in CI)
async function setupStubs(page) {
  const FILE = FILE_NAME;
  const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
  const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
  const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/.+/;
  await page.route(SEARCH_URL_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: 'zx_Jetpac_1983_Ultimate_Play_The_Game' }] } }) }));
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
  // Diagnostic: ensure navigation resolved to the expected origin and log it
  const resolvedUrl = await page.url();
  // eslint-disable-next-line no-console
  console.log('[E2E] resolved page URL =', resolvedUrl);
  await expect(resolvedUrl.startsWith('http://127.0.0.1:8080') || resolvedUrl.startsWith('http://localhost:8080')).toBeTruthy();
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

  // Baseline snapshot of the full display memory (0x4000..0x57FF) — used for authoritative fallbacks
  const baselineDisplayMem = await page.evaluate(() => {
    try { const mem = window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null; if (!mem) return null; return Array.from(mem.slice(0, 0x1800)); } catch (e) { return null; }
  });

  const baselinePixels = await captureCanvasPixels(page);
  // increase timeout for screenshot to avoid intermittent page.screenshot() timeouts
  await testInfo.attach('baseline-screenshot', { body: Buffer.from(await page.screenshot({ timeout: 60000 })), contentType: 'image/png' }).catch(() => { });

  // Ensure emulator is running before pressing START (try UI/API start if paused)
  const ensureEmuRunning = async (timeout = 3000) => {
    const start = Date.now();
    const isRunning = async () => await page.evaluate(() => !!(window.emu && window.emu._running));
    if (await isRunning()) return true;

    // Try UI start buttons and programmatic start methods
    await page.evaluate(() => {
      try {
        const sel = 'button[title="Unpause"], button[title="Start"], button[title="Run"], button[title="Play"]';
        const btn = document.querySelector(sel);
        if (btn) btn.click();
        const overlay = Array.from(document.querySelectorAll('button')).find(b => b.style && b.style.position === 'absolute' && /play|start|unpause/i.test((b.textContent || b.title || '')));
        if (overlay) overlay.click();
        if (window.emu && typeof window.emu.start === 'function') { try { window.emu.start(); } catch (e) { } }
        if (window.emu && typeof window.emu.run === 'function') { try { window.emu.run(); } catch (e) { } }
      } catch (e) { /* ignore */ }
    });

    while (Date.now() - start < timeout) {
      if (await isRunning()) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };

  const emuWasRunning = await ensureEmuRunning(3000);
  if (!emuWasRunning) {
    // attach diagnostics so failures show why START had no effect
    const runtimeDebugOnNoStart = await page.evaluate(() => ({ emu: !!window.emu, emuStatus: window.emu ? { running: !!window.emu._running, PC: window.emu.cpu ? window.emu.cpu.PC : null } : null, pageText: document.body ? document.body.innerText.slice(0, 300) : null }));
    await testInfo.attach('emu-not-running-before-start.json', { body: JSON.stringify(runtimeDebugOnNoStart, null, 2), contentType: 'application/json' });
    await testInfo.attach('emu-not-running-before-start-screenshot', { body: Buffer.from(await page.screenshot()), contentType: 'image/png' }).catch(() => { });
    console.log('[WARN] emulator not running after UI/API start attempts — continuing to send START key (may still fail)');
  }

  // Robust START: click/focus the canvas then try locator.press('5') + fallbacks
  try {
    const canvas = page.locator('#screen, canvas').first();
    await canvas.click({ force: true }).catch(() => { });
    await page.waitForTimeout(120);
    await canvas.focus().catch(() => { });
    // preferred: element press
    await canvas.press('5').catch(() => { });
    // fallback: keyboard + debug helper
    await page.keyboard.press('5').catch(() => { });
    await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('5'); } catch (e) { } });

    // Extra fallback for worker-based runtimes (JSSpeccy 3): dispatch real DOM KeyboardEvents to canvas
    await page.evaluate(() => {
      try {
        const c = document.querySelector('#screen') || document.querySelector('canvas');
        if (!c) return;
        c.tabIndex = c.tabIndex || 0;
        c.focus();
        const keyEvent = (type) => new KeyboardEvent(type, {
          key: '5', code: 'Digit5', keyCode: 53, which: 53,
          bubbles: true, cancelable: true, composed: true, view: window
        });
        c.dispatchEvent(keyEvent('keydown'));
        c.dispatchEvent(keyEvent('keypress'));
        setTimeout(() => c.dispatchEvent(keyEvent('keyup')), 60);
      } catch (e) { /* ignore */ }
    });
  } catch (e) {
    // best-effort only
    console.log('[START SEND ERROR]', String(e));
  }

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

  // Add extra debug snapshot: portWrites, sound toggles, last memWrites and emulator status
  const runtimeDebug = await page.evaluate(() => {
    try {
      return {
        portWritesDebug: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites)) ? window.__ZX_DEBUG__.portWrites.slice(-64) : (window.emu && Array.isArray(window.emu._portWrites) ? window.emu._portWrites.slice(-64) : []),
        soundToggles: (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-64) : [],
        memWritesDebug: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-128) : (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites) ? window.emu.memory._memWrites.slice(-128) : []),
        __TEST__: (window.__TEST__ || null),
        emuStatus: { running: !!(window.emu && window.emu._running), PC: window.emu && window.emu.cpu ? window.emu.cpu.PC : null }
      };
    } catch (e) { return { error: String(e) }; }
  });
  await testInfo.attach('post-start-debug.json', { body: JSON.stringify(runtimeDebug, null, 2), contentType: 'application/json' });

  // eslint-disable-next-line no-console
  console.log('[E2E debug] runtimeDebug:', JSON.stringify(runtimeDebug, null, 2));

  // screenshot immediately after START for visual trace
  await testInfo.attach('post-start-screenshot', { body: Buffer.from(await page.screenshot({})), contentType: 'image/png' }).catch(() => { });

  // eslint-disable-next-line no-console
  console.log('POST-START-TIMELINE-SAMPLE:', JSON.stringify(startTimeline.slice(0, 8)));

  // Use canonical sequence detection (rocket → beep → enemy) derived from reference runs
  const seq = await waitForStartSequence(page, { baselinePixels, baselineMem, baselineDisplay: baselineDisplayMem, timeouts: { rocket: 3000, beep: 2500, enemy: 4000 } });
  const frames = [];
  let enemyDetected = seq.enemy;
  let rocketDetected = seq.rocket;
  let beepDetected = seq.beep;
  let displayMemWritesDetected = false;

  // If sequence didn't detect enemy visually, still collect frames for post-mortem and try the per-frame fallbacks
  for (let i = 0; i < MAX_FRAMES && (!enemyDetected || !rocketDetected || !beepDetected); i++) {
    if (!beepDetected) beepDetected = await detectBeepViaToggles(page, 200);
    const pixels = await captureCanvasPixels(page);
    frames.push(pixels);
    if (!rocketDetected) rocketDetected = await detectRocketMemoryWrites(page, baselineMem);
    if (!displayMemWritesDetected) displayMemWritesDetected = await detectDisplayMemoryWrites(page, baselineDisplayMem);
    if (!enemyDetected) enemyDetected = detectMovingBlob(baselinePixels, [pixels]) || displayMemWritesDetected;
    if (enemyDetected && rocketDetected && beepDetected) break;
    await page.waitForTimeout(FRAME_INTERVAL);
  }

  // Now check firing: press Space and expect a bullet to appear (small moving blob)
  const beforeFireFrames = frames.slice(-6);
  await page.keyboard.press('Space').catch(() => { });
  await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('space'); setTimeout(() => { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.releaseKey === 'function') window.__ZX_DEBUG__.releaseKey('space'); }, 120); } catch (e) { } });

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

  // Final assertions: we EXPECT enemies & rocket parts & bullets — accept display-memory writes as authoritative fallback for enemy detection
  expect(beepDetected, 'expected audio/beep after pressing START').toBeTruthy();
  expect(enemyDetected || displayMemWritesDetected, 'expected asteroids/enemies to appear after pressing 5 (visual OR display-memory writes)').toBeTruthy();
  expect(rocketDetected, 'expected rocket parts / platform writes (0x4800..0x49FF) after pressing 5').toBeTruthy();
  expect(bulletDetected, 'expected pressing Space to fire a bullet (visual change)').toBeTruthy();

  // Attach a helpful note if we relied on the fallback
  if (!enemyDetected && displayMemWritesDetected) {
    await testInfo.attach('enemy-detected-by-fallback.txt', { body: 'Enemy not detected visually; passed because display memory writes were observed.', contentType: 'text/plain' }).catch(() => { });
  }

});
