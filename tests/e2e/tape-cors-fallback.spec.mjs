// @e2e @tape @cors
import { test, expect } from '@playwright/test';

const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;
const CORS_ARCHIVE_PATTERN = /cors\.archive\.org\/cors\//;

// Minimal Z80 payload helper (PC at 0x4000)
function generateMinimalZ80Payload() {
  const header = new Uint8Array(30);
  header[0x0C] = 0x00; // PC low
  header[0x0D] = 0x40; // PC high -> 0x4000
  const ram = new Uint8Array(48 * 1024);
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out;
}

const TEST_IDENTIFIER = 'zx_Jetpac_1983_Test';
const TEST_FILENAME = 'Jetpac_1983_Test.z80';

const MOCK_SEARCH_RESPONSE = {
  responseHeader: { status: 0 },
  response: { numFound: 1, start: 0, docs: [{ identifier: TEST_IDENTIFIER, title: 'Jetpac Test', creator: 'Tester', mediatype: 'software', format: ['Z80 Snapshot'], publicdate: '2014-01-06T00:00:00Z' }] }
};

const MOCK_METADATA_RESPONSE = {
  created: 1389052800,
  files: [ { name: TEST_FILENAME, source: 'original', format: 'Z80 Snapshot', size: '49179' } ],
  server: 'ia800300.us.archive.org',
  workable_servers: ['bad.host.archive.org', 'ia800300.us.archive.org'],
  d1: 'ia600300.us.archive.org',
  metadata: { identifier: TEST_IDENTIFIER, title: 'Jetpac Test', creator: 'Tester', description: 'Test' }
};

async function openAndSearch(page){
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();
  const tapeBtn = page.locator('button:has-text("Tape Library")');
  await tapeBtn.click();
  await expect(page.locator('.tape-ui')).toBeVisible();
  // perform search
  await page.locator('input.tape-search-input').fill('Jetpac');
  await page.locator('button.tape-search-btn').click();
}

test('fallback to cors.archive.org when direct fetch blocked', async ({ page }) => {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  // Original download: simulate CORS/network block by aborting the request
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => {
    await route.abort();
  });

  // CORS fallback: return bytes WITH Access-Control-Allow-Origin header to allow fetch
  await page.route(CORS_ARCHIVE_PATTERN, async (route) => {
    const payload = generateMinimalZ80Payload();
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(payload), headers: { 'Content-Length': String(payload.length), 'Access-Control-Allow-Origin': '*' } });
  });

  // Run flow
  await openAndSearch(page);
  // open details
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  // Listen for tape-loaded event
  const tapeEventPromise = page.evaluate(() => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tape-loaded timeout')), 10000);
    window.addEventListener('tape-loaded', (e) => { clearTimeout(t); resolve(e.detail || {}); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(t); reject(new Error('load error: ' + (e.detail && e.detail.message))); }, { once: true });
  }));

  // Click Load snapshot
  await page.locator(`.tape-file-item:has-text("${TEST_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  const ev = await tapeEventPromise;
  expect(ev).toBeTruthy();

  // Confirm registers applied (PC=0x4000)
  await page.waitForFunction(() => {
    try{ return window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.getRegisters === 'function' && window.__ZX_DEBUG__.getRegisters().PC === 0x4000; } catch(e){ return false; }
  }, { timeout: 2000 });
});

// --- additional test: ensure workable_servers list is tried and one server succeeds ---
test('tries workable_servers list and succeeds when one server responds with CORS', async ({ page }) => {
  const WORKABLE_TEST_ID = 'zx_Workable_Servers_Test';
  const WORKABLE_FILENAME = 'Workable.z80';
  const SEARCH = { responseHeader: { status: 0 }, response: { numFound: 1, start: 0, docs: [{ identifier: WORKABLE_TEST_ID, title: 'Workable', creator: 'Tester', mediatype: 'software', format: ['Z80 Snapshot'] }] } };
  const META = { files: [ { name: WORKABLE_FILENAME, format: 'Z80 Snapshot' } ], workable_servers: ['bad.archive.org', 'ia7777.us.archive.org'], identifier: WORKABLE_TEST_ID };

  await page.route(SEARCH_URL_PATTERN, async (route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH) }));
  await page.route(METADATA_URL_PATTERN, async (route) => await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(META) }));

  // Original abort
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => await route.abort());

  // First workable server (bad) - return 403
  await page.route(/cors\.archive\.org\/cors\/bad\.archive\.org\/.+/, async (route) => {
    await route.fulfill({ status: 403, contentType: 'text/plain', body: 'Forbidden' });
  });

  // Second workable server - return bytes with ACAO
  await page.route(/cors\.archive\.org\/cors\/ia7777\.us\.archive\.org\/.+/, async (route) => {
    const payload = generateMinimalZ80Payload();
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(payload), headers: { 'Content-Length': String(payload.length), 'Access-Control-Allow-Origin': '*' } });
  });

  // Run flow
  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((b) => b.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  const tapeEventPromise = page.evaluate(() => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tape-loaded timeout')), 10000);
    window.addEventListener('tape-loaded', (e) => { clearTimeout(t); resolve(e.detail || {}); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(t); reject(new Error('load error: ' + (e.detail && e.detail.message))); }, { once: true });
  }));

  await page.locator(`.tape-file-item:has-text("${WORKABLE_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  // Wait for the fallback candidates to be recorded and ensure our workable server candidate is present
  await page.waitForFunction(() => !!(window.__CORS_CANDIDATES__ && window.__CORS_CANDIDATES__.length > 0), { timeout: 2000 });
  const candidates = await page.evaluate(() => window.__CORS_CANDIDATES__ || []);
  const found = candidates.some(c => /ia7777\.us\.archive\.org/.test(c));
  if (!found) {
    const tried = await page.evaluate(() => window.__CORS_TRIED__ || []);
    throw new Error(`workable server not attempted; candidates=${JSON.stringify(candidates)} tried=${JSON.stringify(tried)}`);
  }

  const ev = await tapeEventPromise;
  expect(ev).toBeTruthy();

  // Confirm PC applied
  await page.waitForFunction(() => {
    try{ return window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.getRegisters === 'function' && window.__ZX_DEBUG__.getRegisters().PC === 0x4000; } catch(e){ return false; }
  }, { timeout: 2000 });
});

test('reports ZX-style error when both original and fallback fail', async ({ page }) => {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  // Original: simulate network/CORS failure by aborting
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, async (route) => {
    await route.abort();
  });

  // CORS fallback returns 403 (failure)
  await page.route(CORS_ARCHIVE_PATTERN, async (route) => {
    await route.fulfill({ status: 403, contentType: 'text/plain', body: 'Not allowed' });
  });

  // Run flow
  await openAndSearch(page);
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  // Listen for tape-load-error
  const errPromise = page.evaluate(() => new Promise((resolve) => {
    window.addEventListener('tape-load-error', (e) => resolve(e.detail || {}), { once: true });
    setTimeout(() => resolve({ timeout: true }), 10000);
  }));

  await page.locator(`.tape-file-item:has-text("${TEST_FILENAME}") .tape-load-btn`).evaluate(b => b.click());

  const detail = await errPromise;
  // Should be a CORS-mapped error
  expect(detail.code).toBe('CORS');

  // Status text should show ZX-style message
  await page.waitForFunction(() => (document.getElementById('status') && document.getElementById('status').textContent || '').includes('R Tape loading error'), { timeout: 2000 });
});