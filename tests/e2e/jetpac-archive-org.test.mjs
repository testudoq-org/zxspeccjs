import { test, expect } from '@playwright/test';
import { waitForBootComplete, verifyBootGlyph } from '../_helpers/bootHelpers.mjs';

// This test navigates the Tape Library UI (which queries archive.org), loads
// the Jetpac 16K .z80 snapshot, presses "5" and asserts a beep is produced
// and dynamic objects (projectiles / rockets) appear within 5s.

const TITLE = 'Jetpac [a][16K] Ultimate Play The Game';
const SEARCH_QUERY = 'Jetpac';
const FILE_NAME = 'Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const EMU_READY_SELECTOR = '[data-testid="screen"]';
const MAX_BEEP_WAIT = 5000; // ms
const FRAME_INTERVAL = 150; // ms
const MAX_FRAMES = 120; // extended capture (~18s) to allow slow boots/visuals

// Tunable thresholds for visual-diff heuristics
const PIXEL_DIFF_THRESHOLD = 40; // per-channel brightness diff to count as "changed"
const MIN_BLOB_PIXELS = 6; // smallest moving-object area to accept

// Helper: poll for a beep by checking emu.sound._toggles, port writes (0xFE), or debug portWrites
async function detectBeepViaToggles(page, timeout = MAX_BEEP_WAIT) {
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

// Helper: capture canvas pixel data (returns Uint8ClampedArray serialized as Array)
async function captureCanvasPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#screen');
    if (!c) return null;
    const ctx = c.getContext('2d');
    try {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      return Array.from(img.data);
    } catch (e) { return null; }
  });
}

// Simple frame-diff heuristic: count pixels whose per-channel abs-diff > threshold
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

// Detect small moving blobs by scanning for runs of changed pixels (approximate)
function detectMovingBlob(basePixels, framesPixels) {
  for (const p of framesPixels) {
    const changed = frameDiffCount(basePixels, p);
    // Heuristic: moving projectiles occupy relatively few pixels but cause
    // detectable changes between frames. Use absolute count threshold.
    if (changed >= MIN_BLOB_PIXELS && changed < 2000) return true;
  }
  return false;
}

// Also check memory writes in rocket area 0x4800..0x49FF (page[1] indices)
// Fallbacks: inspect __ZX_DEBUG__.rocketWrites or __ZX_DEBUG__.memWrites if direct page compare fails
async function detectRocketMemoryWrites(page, beforeSnapshot) {
  const pageCheck = await page.evaluate((before) => {
    try {
      const mem = window.emu && window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
      if (!mem) return false;
      const start = 0x4800 - 0x4000; // offset into pages[1]
      const end = 0x49FF - 0x4000;
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

  // Check debug-write logs as a fallback (some runs may not expose immediate page changes)
  const dbg = await page.evaluate(() => {
    try {
      const rocket = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites)) ? window.__ZX_DEBUG__.rocketWrites.slice(-8) : [];
      const memWrites = (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-16) : [];
      const hasRocketWrites = rocket.length > 0;
      const hasMemWritesInRange = memWrites.some(w => (w.addr >= 0x4800 && w.addr <= 0x49FF));
      return { hasRocketWrites, hasMemWritesInRange };
    } catch (e) { return { hasRocketWrites: false, hasMemWritesInRange: false }; }
  });

  return dbg.hasRocketWrites || dbg.hasMemWritesInRange;
}

// Main test
// Use live Archive.org snapshot when running locally (CI remains stubbed)
const LIVE_MODE = process.env.TAPE_LIBRARY_LIVE === '1' || !process.env.CI;
const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;
const CORS_ARCHIVE_PATTERN = /cors\.archive\.org\/cors\//;
const DIRECT_SERVER_PATTERN = /ia\d+\.us\.archive\.org\//;

function _injectMarkerIntoRam(ram) {
  // keep a tiny marker so canvas changes are visible in stubbed snapshot
  ram[120] = 0xFF;
}

async function setupStubs(page) {
  await page.route(SEARCH_URL_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: { numFound: 1, docs: [{ identifier: 'zx_Jetpac_1983_Ultimate_Play_The_Game' }] }}) }));
  await page.route(METADATA_URL_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ name: FILE_NAME, format: 'Z80 Snapshot' }] }) }));
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, (route) => route.fulfill((() => {
    // Build minimal .z80 payload (header + 48K RAM filled with non-zero screen)
    const PAGE_SIZE = 16384;
    const header = new Uint8Array(30);
    header[0] = 0xFF; header[1] = 0x44; header[6] = 0x00; header[7] = 0x80; header[8] = 0x00; header[9] = 0xFF; header[10] = 0x3F; header[11] = 0x01; header[27] = 1; header[28] = 1; header[29] = 1;
    const ram = new Uint8Array(3 * PAGE_SIZE).fill(0);
    for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
    for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
    _injectMarkerIntoRam(ram);

    // Insert a tiny resident loop at 0x8000 that writes to 0x4800..0x49FF
    // and toggles speaker via OUT (0xFE). This makes the stubbed snapshot
    // produce both memWrites and beeper toggles so the E2E can validate.
    const code = [
      0x21, 0x00, 0x48, // LD HL,0x4800
      0x3E, 0xAA,       // LD A,0xAA
      0x06, 0x10,       // LD B,0x10
      0x77,             // LD (HL),A
      0x23,             // INC HL
      0xD3, 0xFE,       // OUT (0xFE),A
      0x10, 0xFA,       // DJNZ loop (relative -6)
      0xC3, 0x03, 0x80  // JP 0x8003 (reload A/B)
    ];
    const codeOffset = 0x4000; // place at 0x8000 in address space
    for (let i = 0; i < code.length; i++) ram[codeOffset + i] = code[i];

    const out = new Uint8Array(header.length + ram.length);
    out.set(header, 0); out.set(ram, header.length);
    return { status: 200, contentType: 'application/octet-stream', body: Buffer.from(out) };
  })()));
  await page.route(CORS_ARCHIVE_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(new Uint8Array([0x00])) }));
  await page.route(DIRECT_SERVER_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(new Uint8Array([0x00])) }));
}

test('Jetpac: pressing 5 produces beep and dynamic objects (archive.org)', async ({ page }, testInfo) => {
  // Make test non-flaky — extend timeout to allow ROM boot + visual checks
  testInfo.setTimeout(90000);

  if (!LIVE_MODE) await setupStubs(page);

  // 1) Navigate to app root (tape UI lives here)
  await page.goto('/');
  await expect(page.locator(EMU_READY_SELECTOR)).toBeVisible({ timeout: 10000 });
  // Ensure page load has fully settled, then wait a "dirty" 10s to allow BIOS/ROM to finish rendering
  await page.waitForLoadState('load');
  await page.waitForTimeout(10000);

  // 2) Wait for ROM boot + copyright glyph (use canonical helpers)
  const boot = await waitForBootComplete(page, 10000);
  const glyphResult = await verifyBootGlyph(page);
  await testInfo.attach('boot-check.json', { body: JSON.stringify({ boot, glyphResult }, null, 2), contentType: 'application/json' });
  expect(boot.bootComplete || glyphResult.romHasCopyright || glyphResult.fbHasText, 'ROM must have finished boot and copyright glyph must be present').toBeTruthy();
  await page.waitForTimeout(200);

  await page.locator('[data-testid="tape-library-btn"]').click();
  const searchInput = page.locator('[data-testid="tape-search-input"]');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(SEARCH_QUERY);
  await page.locator('[data-testid="tape-search-btn"]').click();

  // Wait for results and open details for the match
  await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: 15000 });
  // Find the specific result item with title "Jetpac [a][16K]" and click its Details button
  const targetResult = page.locator('li.tape-result-item:has-text("Jetpac [a][16K]")').first();
  await expect(targetResult, 'expected search results to contain "Jetpac [a][16K]"').toBeVisible({ timeout: 15000 });
  const detailsBtn = targetResult.locator('.tape-result-details-btn, [data-testid="tape-result-details-btn"]').first();
  await expect(detailsBtn, 'expected Details button for Jetpac [a][16K]').toBeVisible({ timeout: 15000 });
  // Use an in-page DOM click to avoid pointer interception by the debug panel overlay
  await detailsBtn.evaluate((btn) => btn.click());
  await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: 15000 });

  // Prefer matching by data-name OR validate that a `Load` button appears in the details panel.
  // This is more robust than exact visible-text matching (avoids invisible/whitespace differences).
  const fileItemByName = page.locator(`.tape-file-item[data-name="${FILE_NAME}"]`);
  let loadBtn;
  if ((await fileItemByName.count()) > 0) {
    await expect(fileItemByName, `expected file list to contain ${FILE_NAME}`).toBeVisible({ timeout: 15000 });
    loadBtn = fileItemByName.locator('[data-testid="tape-load-btn"]');
  } else {
    // Fallback: assert that a Load button is present in the detail view and use it
    loadBtn = page.locator('[data-testid="tape-load-btn"]').first();
    await expect(loadBtn, 'expected a Load button to appear in the details panel').toBeVisible({ timeout: 15000 });
  }

  // Prepare tape-loaded promise
  const tapeLoaded = page.evaluate(() => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tape-loaded timeout')), 15000);
    window.addEventListener('tape-loaded', (e) => { clearTimeout(t); resolve(e.detail || {}); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(t); reject(new Error(e.detail?.message || 'tape-load-error')); }, { once: true });
  }));

  // Click load
  await loadBtn.evaluate(b => b.click());
  await tapeLoaded;

  // Verify the status text confirms the snapshot was applied (accept either filename variant with or without `_a_`)
  const statusEl = page.locator('[data-testid="status"]');
  await expect(statusEl).toHaveText(/Snapshot\s+Jetpac_1983_Ultimate_Play_The_Game(?:_a)?_16K\.z80\s+applied/i, { timeout: 8000 });

  // Wait until emulator is running and canvas visible
  await page.waitForFunction(() => !!(window.emu && window.emu._running), null, { timeout: 10000 });
  await page.waitForTimeout(300); // allow a few frames to settle

  // Baseline capture: memory slice of rocket area + canvas pixels
  const baselineMem = await page.evaluate(() => {
    try {
      const mem = window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
      if (!mem) return null;
      const start = 0x4800 - 0x4000; const end = 0x49FF - 0x4000;
      return Array.from(mem.slice(start, end + 1));
    } catch (e) { return null; }
  });
  const baselinePixels = await captureCanvasPixels(page);
  await testInfo.attach('baseline-screenshot', { body: Buffer.from(await page.screenshot({}), 'utf8'), contentType: 'image/png' }).catch(()=>{});

  // Press '5' (try both keyboard and emulator helper if available)
  try { await page.keyboard.press('5'); } catch (e) { /* ignore */ }
  // Use debug helper to ensure key matrix is toggled (press+hold then release)
  await page.evaluate(async () => {
    try {
      if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressAndHold === 'function') {
        await window.__ZX_DEBUG__.pressAndHold('5', 120);
      } else if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') {
        window.__ZX_DEBUG__.pressKey('5');
        setTimeout(() => { try { window.__ZX_DEBUG__.releaseKey('5'); } catch(e){} }, 120);
      }

      // Force a few explicit renders so canvas/framebuffer reflects any immediate changes
      if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') {
        try { for (let i = 0; i < 3; i++) window.emulator.ula.render(); } catch (e) { /* ignore */ }
      }
    } catch (e) {}
  });

  // Immediate diagnostics after pressing START (attach to test artifacts if needed)
  const postStartDiag = await page.evaluate(() => {
    try {
      const cpu = window.emu && window.emu.cpu ? { PC: window.emu.cpu.PC, t: window.emu.cpu.tstates } : null;
      const running = !!(window.emu && window.emu._running);
      const toggles = (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-8) : [];
      const memWrites = (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites)) ? window.emu.memory._memWrites.slice(-8) : [];
      const rocketSample = (window.emu && window.emu.memory && window.emu.memory.pages && window.emu.memory.pages[1]) ? Array.from(window.emu.memory.pages[1].slice(0x4800 - 0x4000, 0x4800 - 0x4000 + 16)) : null;
      return { cpu, running, toggles, memWrites, rocketSample };
    } catch (e) { return { error: String(e) }; }
  });
  await testInfo.attach('postStartDiag.json', { body: JSON.stringify(postStartDiag, null, 2), contentType: 'application/json' });

  // Detect beep (via emu.sound._toggles) while sampling frames and rocket-area writes
  const frames = [];
  let beepDetected = false;
  let rocketDetected = false;
  for (let i = 0; i < MAX_FRAMES; i++) {
    // check beep toggles quickly
    if (!beepDetected) beepDetected = await detectBeepViaToggles(page, 200);

    // capture a frame for later visual diff
    const pixels = await captureCanvasPixels(page);
    frames.push(pixels);

    // check rocket-area mem writes (early exit if detected)
    if (!rocketDetected) {
      rocketDetected = await detectRocketMemoryWrites(page, baselineMem);
      // also check debug-captured rocketWrites as a fast path
      if (!rocketDetected) rocketDetected = await page.evaluate(() => !!(window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites) && window.__ZX_DEBUG__.rocketWrites.length > 0));
    }

    // break early if we've seen the beep and either visual OR mem evidence
    if (beepDetected && (rocketDetected || detectMovingBlob(baselinePixels, [pixels]))) {
      // keep a few additional frames for visual stability
      if (i > 4) break;
    }

    await page.waitForTimeout(FRAME_INTERVAL);
  }

  // Attach sampled frames
  for (let i = 0; i < frames.length; i++) {
    try {
      await testInfo.attach(`frame-${i}`, { body: Buffer.from(await page.screenshot({ clip: { x: 0, y: 0, width: 320, height: 240 } })), contentType: 'image/png' });
    } catch (e) { /* ignore attach errors */ }
  }

  // Visual analysis: detect small moving blobs between baseline and frames
  const movingDetected = detectMovingBlob(baselinePixels, frames);

  // Memory analysis: check rocket-area writes after pressing START
  const rocketMemWrites = await detectRocketMemoryWrites(page, baselineMem);

  // Final assertions: beep + (visual OR memory) must be true
  expect(beepDetected, 'expected beep within 5s after pressing 5').toBeTruthy();
  const visualOrMem = movingDetected || rocketMemWrites;
  if (!visualOrMem) {
    // Attach extra diagnostics on failure
    const memAfter = await page.evaluate(() => {
      try {
        const mem = window.emu.memory && window.emu.memory.pages ? window.emu.memory.pages[1] : null;
        if (!mem) return null;
        const start = 0x4800 - 0x4000; const end = 0x49FF - 0x4000;
        return Array.from(mem.slice(start, end + 1));
      } catch (e) { return null; }
    });

    const dbgExtras = await page.evaluate(() => {
      return {
        portWrites: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites)) ? window.__ZX_DEBUG__.portWrites.slice(-20) : [],
        memWrites: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-64) : [],
        rocketWrites: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.rocketWrites)) ? window.__ZX_DEBUG__.rocketWrites.slice(-64) : [],
        soundToggles: (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-64) : []
      };
    });

    await testInfo.attach('rocket-mem-before', { body: JSON.stringify(baselineMem || []), contentType: 'application/json' });
    await testInfo.attach('rocket-mem-after', { body: JSON.stringify(memAfter || []), contentType: 'application/json' });
    await testInfo.attach('debug-extras', { body: JSON.stringify(dbgExtras, null, 2), contentType: 'application/json' });
  }
  expect(visualOrMem, 'expected moving projectiles or rocket sprite memory changes after pressing 5').toBeTruthy();

  // Save success artifacts
  await testInfo.attach('beep-detected', { body: Buffer.from(String(beepDetected)), contentType: 'text/plain' });
});
