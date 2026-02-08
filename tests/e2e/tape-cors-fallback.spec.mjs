// @e2e @tape @cors
/* eslint-disable no-undef */
import { test, expect } from '@playwright/test';

const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;
const CORS_ARCHIVE_PATTERN = /cors\.archive\.org\/cors\//;
// Direct server URL pattern — matches ia800300.us.archive.org, ia600300.us.archive.org, etc.
const DIRECT_SERVER_PATTERN = /ia\d+\.us\.archive\.org\//;

// Minimal Z80 payload helper (PC at 0x4000) — correct v1 header offsets
function generateMinimalZ80Payload() {
  const header = new Uint8Array(30);
  header[6] = 0x00;  // PC low (offset 6)
  header[7] = 0x40;  // PC high (offset 7) → 0x4000
  header[27] = 1;    // IFF1 = enabled
  header[29] = 1;    // IM 1
  const ram = new Uint8Array(48 * 1024);
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out;
}

function z80Payload() {
  const payload = generateMinimalZ80Payload();
  return { status: 200, contentType: 'application/octet-stream', body: Buffer.from(payload), headers: { 'Content-Length': String(payload.length), 'Access-Control-Allow-Origin': '*' } };
}

const TEST_IDENTIFIER = 'zx_Jetpac_1983_Test';
const TEST_FILENAME = 'Jetpac_1983_Test.z80';

const MOCK_SEARCH_RESPONSE = {
  responseHeader: { status: 0 },
  response: { numFound: 1, start: 0, docs: [{ identifier: TEST_IDENTIFIER, title: 'Jetpac Test', creator: 'Tester', mediatype: 'software', format: ['Z80 Snapshot'], publicdate: '2014-01-06T00:00:00Z' }] }
};

const MOCK_METADATA_RESPONSE = {
  created: 1389052800,
  dir: '/27/items/zx_Jetpac_1983_Test',
  files: [ { name: TEST_FILENAME, source: 'original', format: 'Z80 Snapshot', size: '49179' } ],
  server: 'ia800300.us.archive.org',
  workable_servers: ['bad.host.archive.org', 'ia800300.us.archive.org'],
  d1: 'ia600300.us.archive.org',
  metadata: { identifier: TEST_IDENTIFIER, title: 'Jetpac Test', creator: 'Tester', description: 'Test' }
};

async function openAndSearch(page) {
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();
  const tapeBtn = page.locator('button:has-text("Tape Library")');
  await tapeBtn.click();
  await expect(page.locator('.tape-ui')).toBeVisible();
  await page.locator('input.tape-search-input').fill('Jetpac');
  await page.locator('button.tape-search-btn').click();
}

function waitForTapeLoaded(page, timeoutMs = 10000) {
  return page.evaluate((t) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tape-loaded timeout')), t);
    window.addEventListener('tape-loaded', (e) => { clearTimeout(timer); resolve(e.detail || {}); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(timer); reject(new Error('load error: ' + (e.detail && e.detail.message))); }, { once: true });
  }), timeoutMs);
}

function expectPCApplied(page) {
  return page.waitForFunction(() => {
    try { return window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.getRegisters === 'function' && window.__ZX_DEBUG__.getRegisters().PC === 0x4000; } catch (_) { return false; }
  }, { timeout: 2000 });
}

// ────────────────────────────────────────────────────────────────
// Test 1: Direct server URL (server+dir) works on first try
// ────────────────────────────────────────────────────────────────
test('loads via direct server+dir URL (jsspeccy3 approach)', async ({ page }) => {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  // Direct server URL succeeds (the primary path under the new approach)
  await page.route(DIRECT_SERVER_PATTERN, async (route) => {
    await route.fulfill(z80Payload());
  });

  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  const tapeEventPromise = waitForTapeLoaded(page);
  await page.locator(`.tape-file-item:has-text("${TEST_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  const ev = await tapeEventPromise;
  expect(ev).toBeTruthy();
  await expectPCApplied(page);
});

// ────────────────────────────────────────────────────────────────
// Test 2: Direct server blocked → falls back to cors.archive.org
// ────────────────────────────────────────────────────────────────
test('fallback to cors.archive.org when direct server fetch blocked', async ({ page }) => {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  // Direct server: CORS/network block
  await page.route(DIRECT_SERVER_PATTERN, async (route) => {
    await route.abort();
  });

  // Older archive.org/download pattern also blocked (just in case)
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => {
    await route.abort();
  });

  // cors.archive.org fallback succeeds
  await page.route(CORS_ARCHIVE_PATTERN, async (route) => {
    await route.fulfill(z80Payload());
  });

  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  const tapeEventPromise = waitForTapeLoaded(page);
  await page.locator(`.tape-file-item:has-text("${TEST_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  const ev = await tapeEventPromise;
  expect(ev).toBeTruthy();
  await expectPCApplied(page);
});

// ────────────────────────────────────────────────────────────────
// Test 3: Primary + cors.archive.org fail → workable server direct URL succeeds
// ────────────────────────────────────────────────────────────────
test('tries workable_servers direct URL and succeeds', async ({ page }) => {
  const WORKABLE_TEST_ID = 'zx_Workable_Servers_Test';
  const WORKABLE_FILENAME = 'Workable.z80';
  const SEARCH = { responseHeader: { status: 0 }, response: { numFound: 1, start: 0, docs: [{ identifier: WORKABLE_TEST_ID, title: 'Workable', creator: 'Tester', mediatype: 'software', format: ['Z80 Snapshot'] }] } };
  const META = {
    files: [ { name: WORKABLE_FILENAME, format: 'Z80 Snapshot' } ],
    server: 'ia800999.us.archive.org',
    dir: '/5/items/zx_Workable_Servers_Test',
    workable_servers: ['bad.archive.org', 'ia7777.us.archive.org'],
    d1: 'ia600999.us.archive.org',
    identifier: WORKABLE_TEST_ID
  };

  await page.route(SEARCH_URL_PATTERN, async (route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH) }));
  await page.route(METADATA_URL_PATTERN, async (route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(META) }));

  // Block everything by default
  await page.route(DIRECT_SERVER_PATTERN, async (route) => await route.abort());
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => await route.abort());
  await page.route(CORS_ARCHIVE_PATTERN, async (route) => {
    await route.fulfill({ status: 403, contentType: 'text/plain', body: 'Forbidden' });
  });

  // Specific: ia7777 workable server direct URL returns success
  // (Playwright routes are LIFO — this overrides the blanket block above for ia7777)
  await page.route(/ia7777\.us\.archive\.org\//, async (route) => {
    await route.fulfill(z80Payload());
  });

  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((b) => b.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  const tapeEventPromise = waitForTapeLoaded(page);
  await page.locator(`.tape-file-item:has-text("${WORKABLE_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  // Verify workable server candidate was built
  await page.waitForFunction(() => !!(window.__CORS_CANDIDATES__ && window.__CORS_CANDIDATES__.length > 0), { timeout: 2000 });
  const candidates = await page.evaluate(() => window.__CORS_CANDIDATES__ || []);
  const found = candidates.some(c => /ia7777\.us\.archive\.org/.test(c));
  if (!found) {
    const tried = await page.evaluate(() => window.__CORS_TRIED__ || []);
    throw new Error(`workable server not in candidates; candidates=${JSON.stringify(candidates)} tried=${JSON.stringify(tried)}`);
  }

  const ev = await tapeEventPromise;
  expect(ev).toBeTruthy();
  await expectPCApplied(page);
});

// ────────────────────────────────────────────────────────────────
// Test 4: All fallbacks fail → ZX-style error message
// ────────────────────────────────────────────────────────────────
test('reports ZX-style error when all fallbacks fail', async ({ page }) => {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  // Block everything
  await page.route(DIRECT_SERVER_PATTERN, async (route) => await route.abort());
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => await route.abort());
  await page.route(CORS_ARCHIVE_PATTERN, async (route) => {
    await route.fulfill({ status: 403, contentType: 'text/plain', body: 'Not allowed' });
  });

  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  const errPromise = page.evaluate(() => new Promise((resolve) => {
    window.addEventListener('tape-load-error', (e) => resolve(e.detail || {}), { once: true });
    setTimeout(() => resolve({ timeout: true }), 10000);
  }));

  await page.locator(`.tape-file-item:has-text("${TEST_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  const detail = await errPromise;
  expect(detail.code).toBe('CORS');

  await page.waitForFunction(() => (document.getElementById('status') && document.getElementById('status').textContent || '').includes('R Tape loading error'), { timeout: 2000 });
});