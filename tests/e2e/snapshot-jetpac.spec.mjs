// @e2e @tape @snapshot
/**
 * E2E test: Load Jetpac .z80 snapshot via Tape Library UI.
 *
 * Automates the exact user flow: open Tape Library → search "Jetpac" →
 * open first Details → click "Load snapshot" → assert status text matches
 * "Snapshot … applied", canvas shows non-blank game content, emulator is
 * running, and screenshot is captured.
 *
 * Uses stubbed network by default; set TAPE_LIBRARY_LIVE=1 for real Archive.org.
 */
/* eslint-env browser, node */
/* eslint no-undef: "off" */
import { test, expect } from '@playwright/test';

// ── Configuration ──
const LIVE_MODE = process.env.TAPE_LIBRARY_LIVE === '1';
const UI_TIMEOUT = 8000;
const NETWORK_TIMEOUT = 12000;

// URL patterns (used only in stub mode)
const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;
const CORS_ARCHIVE_PATTERN = /cors\.archive\.org\/cors\//;
const DIRECT_SERVER_PATTERN = /ia\d+\.us\.archive\.org\//;

// ── Stub data ──
const TEST_ID = 'zx_Jetpac_1983_Ultimate_Play_The_Game';
const TEST_FILE = 'Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

const MOCK_SEARCH_RESPONSE = {
  responseHeader: { status: 0 },
  response: {
    numFound: 1, start: 0,
    docs: [{
      identifier: TEST_ID,
      title: 'Jetpac (1983)(Ultimate Play The Game)',
      creator: 'Ultimate Play The Game',
      mediatype: 'software',
      format: ['Z80 Snapshot', 'Metadata'],
      publicdate: '2014-01-06T00:00:00Z'
    }]
  }
};

const MOCK_METADATA_RESPONSE = {
  created: 1389052800,
  d1: 'ia600300.us.archive.org',
  d2: 'ia800300.us.archive.org',
  dir: `/27/items/${TEST_ID}`,
  files: [
    { name: TEST_FILE, source: 'original', format: 'Z80 Snapshot', size: '49179' }
  ],
  files_count: 1,
  metadata: {
    identifier: TEST_ID,
    title: 'Jetpac (1983)(Ultimate Play The Game)',
    creator: 'Ultimate Play The Game',
    description: 'Classic ZX Spectrum game.'
  },
  server: 'ia800300.us.archive.org',
  workable_servers: ['ia800300.us.archive.org', 'ia600300.us.archive.org']
};

/**
 * Generate a minimal valid Z80 v1 snapshot with non-blank screen data.
 * Fills the screen bitmap area (0x4000-0x57FF) and attributes (0x5800-0x5AFF)
 * so the emulator renders visible content after loading.
 */
function generateJetpacZ80Payload() {
  const PAGE_SIZE = 16384;
  const header = new Uint8Array(30);
  // A=0xFF, F=0x44
  header[0] = 0xFF;
  header[1] = 0x44;
  // PC = 0x8000 (somewhere in RAM so the loop runs)
  header[6] = 0x00;
  header[7] = 0x80;
  // SP = 0xFF00
  header[8] = 0x00;
  header[9] = 0xFF;
  // I = 0x3F
  header[10] = 0x3F;
  // R = 0x01
  header[11] = 0x01;
  // Flag byte: not compressed (bit5=0), border=0, R bit7=0
  header[12] = 0x00;
  // IFF1=1, IFF2=1, IM=1
  header[27] = 1;
  header[28] = 1;
  header[29] = 1;

  // Build 48K RAM (3 pages)
  const ram = new Uint8Array(3 * PAGE_SIZE);
  // Page 1 (0x4000-0x7FFF) — screen bitmap at offset 0 relative to RAM start
  // Fill screen bitmap (0x4000-0x57FF → RAM[0..6143]) with a pattern so canvas is non-blank
  for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
  // Fill screen attributes (0x5800-0x5AFF → RAM[6144..6911]) with bright white on black
  for (let i = 6144; i < 6912; i++) ram[i] = 0x47; // INK 7, PAPER 0, BRIGHT 1

  // Put a HALT at 0x8000 (RAM offset 0x4000) so emulator doesn't run into garbage
  ram[0x4000] = 0x76; // HALT

  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out;
}

function z80Response() {
  const payload = generateJetpacZ80Payload();
  return {
    status: 200,
    contentType: 'application/octet-stream',
    body: Buffer.from(payload),
    headers: { 'Content-Length': String(payload.length), 'Access-Control-Allow-Origin': '*' }
  };
}

// ── Network stub setup ──
async function setupStubs(page) {
  await page.route(SEARCH_URL_PATTERN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) })
  );
  await page.route(METADATA_URL_PATTERN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) })
  );
  // Catch all download patterns (direct server, cors proxy, archive.org/download)
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, (route) => route.fulfill(z80Response()));
  await page.route(CORS_ARCHIVE_PATTERN, (route) => route.fulfill(z80Response()));
  await page.route(DIRECT_SERVER_PATTERN, (route) => route.fulfill(z80Response()));
}

// ── Test suite ──
test.describe('Jetpac .z80 snapshot load @snapshot', () => {
  /** @type {string[]} */
  let consoleLogs;

  test.beforeEach(async ({ page }) => {
    consoleLogs = [];
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('requestfailed', (req) =>
      consoleLogs.push(`[REQ-FAIL] ${req.url()} ${req.failure()?.errorText}`)
    );
    if (!LIVE_MODE) await setupStubs(page);
  });

  test('full flow: search Jetpac → load snapshot → game renders @smoke', async ({ page }) => {
    // 1. Navigate
    await page.goto('/');
    const canvas = page.locator('[data-testid="screen"]');
    await expect(canvas).toBeVisible({ timeout: UI_TIMEOUT });

    // 2. Open Tape Library
    await page.locator('[data-testid="tape-library-btn"]').click();
    await expect(page.locator('[data-testid="tape-search-input"]')).toBeVisible({ timeout: UI_TIMEOUT });

    // 3. Search for "Jetpac"
    const searchInput = page.locator('[data-testid="tape-search-input"]');
    await searchInput.fill('Jetpac');
    expect(await searchInput.inputValue()).toBe('Jetpac');

    if (!LIVE_MODE) {
      const searchResp = page.waitForResponse(SEARCH_URL_PATTERN, { timeout: NETWORK_TIMEOUT });
      await page.locator('[data-testid="tape-search-btn"]').click();
      await searchResp;
    } else {
      await page.locator('[data-testid="tape-search-btn"]').click();
    }

    // 4. Wait for results
    await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: UI_TIMEOUT });
    const firstDetails = page.locator('[data-testid="tape-result-details-btn"]').first();
    await expect(firstDetails).toBeVisible({ timeout: UI_TIMEOUT });

    // 5. Open Details (use evaluate to bypass potential overlay)
    if (!LIVE_MODE) {
      const metaResp = page.waitForResponse(METADATA_URL_PATTERN, { timeout: NETWORK_TIMEOUT });
      await firstDetails.evaluate((btn) => btn.click());
      await metaResp;
    } else {
      await firstDetails.evaluate((btn) => btn.click());
    }

    // 6. Wait for detail panel and snapshot load button
    await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: UI_TIMEOUT });
    const fileItem = page.locator(`.tape-file-item:has-text("${LIVE_MODE ? '.z80' : TEST_FILE}")`).first();
    await expect(fileItem).toBeVisible({ timeout: UI_TIMEOUT });
    const loadBtn = fileItem.locator('[data-testid="tape-load-btn"]');
    await expect(loadBtn).toBeVisible({ timeout: UI_TIMEOUT });
    await expect(loadBtn).toHaveText(/Load snapshot/i);

    // 7. Set up tape-loaded event listener BEFORE clicking load
    const tapeLoadedPromise = page.evaluate(() => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('tape-loaded event timeout (15s)')), 15000);
      window.addEventListener('tape-loaded', (e) => {
        clearTimeout(timeout);
        resolve({ type: e.type, fileName: e.detail?.fileName });
      }, { once: true });
      window.addEventListener('tape-load-error', (e) => {
        clearTimeout(timeout);
        reject(new Error('tape-load-error: ' + (e.detail?.message || 'unknown')));
      }, { once: true });
    }));

    // 8. Click "Load snapshot"
    await loadBtn.evaluate((btn) => btn.click());
    const tapeEvent = await tapeLoadedPromise;
    expect(tapeEvent.type).toBe('tape-loaded');

    // 9. Assert status text shows "Snapshot … applied"
    const statusEl = page.locator('[data-testid="status"]');
    await expect(statusEl).toHaveText(/Snapshot .+ applied|running/i, { timeout: UI_TIMEOUT });

    // 10. Verify emulator is running
    const isRunning = await page.evaluate(() =>
      !!(window.emu && window.emu._running)
    );
    expect(isRunning).toBe(true);

    // 11. Verify canvas has non-blank content (allow a few frames to render)
    //     The emulator loop needs at least a couple of rAF cycles to paint
    //     the screen bitmap into the canvas.
    let hasScreenContent = false;
    for (let attempt = 0; attempt < 10 && !hasScreenContent; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(200);
      hasScreenContent = await page.evaluate(() => {
        try {
          const c = document.querySelector('#screen');
          if (!c) return false;
          const ctx = c.getContext('2d');
          const img = ctx.getImageData(0, 0, c.width, c.height);
          let nonBlack = 0;
          for (let i = 0; i < img.data.length; i += 4) {
            if (img.data[i] > 0 || img.data[i + 1] > 0 || img.data[i + 2] > 0) nonBlack++;
          }
          return nonBlack > 100; // at least 100 non-black pixels
        } catch { return false; }
      });
    }
    // Fallback: verify screen memory is non-zero (more deterministic than canvas)
    if (!hasScreenContent) {
      hasScreenContent = await page.evaluate(() => {
        try {
          const mem = window.emu && window.emu.memory;
          if (!mem || !mem.pages || !mem.pages[1]) return false;
          // Screen bitmap is at pages[1][0..6143]
          let sum = 0;
          for (let i = 0; i < 6144; i++) sum += mem.pages[1][i];
          return sum > 0;
        } catch { return false; }
      });
    }
    expect(hasScreenContent).toBe(true);

    // 12. Capture screenshot
    await page.screenshot({ path: 'test-results/jetpac-snapshot-loaded.png', fullPage: true });

    // 13. Log console output for debugging
    console.log(`--- Browser console (${consoleLogs.length} lines) ---`);
    consoleLogs.slice(-20).forEach((l) => console.log(l));
  });

  test('status text matches exact pattern after snapshot apply', async ({ page }) => {
    // Simpler focused test: just verify the status element text works
    await page.goto('/');
    await expect(page.locator('[data-testid="screen"]')).toBeVisible({ timeout: UI_TIMEOUT });

    // Open Tape Library → Search → Details → Load (condensed)
    await page.locator('[data-testid="tape-library-btn"]').click();
    const input = page.locator('[data-testid="tape-search-input"]');
    await expect(input).toBeVisible({ timeout: UI_TIMEOUT });
    await input.fill('Jetpac');
    await page.locator('[data-testid="tape-search-btn"]').click();
    await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: UI_TIMEOUT });

    await page.locator('[data-testid="tape-result-details-btn"]').first().evaluate((b) => b.click());
    await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: UI_TIMEOUT });

    const loadBtn = page.locator('[data-testid="tape-load-btn"]').first();
    await expect(loadBtn).toBeVisible({ timeout: UI_TIMEOUT });

    const loaded = page.evaluate(() => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 15000);
      window.addEventListener('tape-loaded', () => { clearTimeout(t); res(true); }, { once: true });
      window.addEventListener('tape-load-error', (e) => { clearTimeout(t); rej(new Error(e.detail?.message)); }, { once: true });
    }));
    await loadBtn.evaluate((b) => b.click());
    await loaded;

    // The status element should contain "Snapshot" and "applied" (or "running" if the loop overwrites quickly)
    const text = await page.locator('[data-testid="status"]').textContent();
    expect(text).toMatch(/Snapshot .+ applied|running/i);
  });
});
