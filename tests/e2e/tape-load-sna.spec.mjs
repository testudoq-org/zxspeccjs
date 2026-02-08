// @e2e @tape @sna @smoke
import { test, expect } from '@playwright/test';

const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const CORS_DOWNLOAD_URL_PATTERN = /cors\.archive\.org\/cors\/([^/]+)\/.+/;

const TEST_IDENTIFIER = 'zx_SNA_Test_1984_Sample';
const TEST_FILENAME = 'sample.sna';

function generateMinimalSNAPayload() {
  // Create a minimal SNA-like payload: 27-byte header + 48K RAM
  const header = new Uint8Array(27);
  // Put a known SP in header at offsets 0x1A-0x1B (little-endian)
  header[0x1A] = 0xFF; // low
  header[0x1B] = 0x7F; // high -> 0x7FFF

  const ram = new Uint8Array(48 * 1024).fill(0);
  // Set first byte of screen memory (0x4000) to non-zero for detection
  // In our loader we place ram into pages[1..3], so offset 0 corresponds to 0x4000
  ram[0] = 0xAA;

  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out;
}

const MOCK_SEARCH_RESPONSE = {
  responseHeader: { status: 0 },
  response: { numFound: 1, start: 0, docs: [{ identifier: TEST_IDENTIFIER, title: 'SNA Test', creator: 'Tester', mediatype: 'software', format: ['SNA Snapshot'], publicdate: '2010-01-01T00:00:00Z' }] }
};

const MOCK_METADATA_RESPONSE = {
  metadata: { title: 'SNA Test', creator: 'Tester', description: 'SNA snapshot test.' },
  files: [ { name: TEST_FILENAME, source: 'original', format: 'SNA Snapshot', size: String(27 + (48*1024)) } ]
};

async function openTapeLibrary(page) {
  const tapeLibraryButton = page.locator('button:has-text("Tape Library")');
  await expect(tapeLibraryButton).toBeVisible();
  await tapeLibraryButton.click();
  await expect(page.locator('.tape-ui')).toBeVisible();
}

async function performSearch(page, query) {
  const searchInput = page.locator('input[type="text"].tape-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(query);
  await page.locator('button.tape-search-btn').click();
}

async function openDetail(page) {
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();
}

async function loadSNA(page) {
  const fileItem = page.locator(`.tape-file-item:has-text("${TEST_FILENAME}")`);
  await expect(fileItem).toBeVisible();
  const loadBtn = fileItem.locator('.tape-load-btn');
  await loadBtn.evaluate(b => b.click());

  // Wait for tape-loaded event
  const evt = await page.evaluate(() => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tape-loaded timeout')), 10000);
    window.addEventListener('tape-loaded', (e) => { clearTimeout(t); resolve(e.detail || {}); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(t); reject(new Error('load error: ' + (e.detail && e.detail.message))); }, { once: true });
  }));

  return evt;
}

test('loads .sna, applies RAM, focuses canvas, and accepts keyboard input', async ({ page }) => {
  // Stub network routes
  await page.route(SEARCH_URL_PATTERN, async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) }); });
  await page.route(METADATA_URL_PATTERN, async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) }); });
  await page.route(CORS_DOWNLOAD_URL_PATTERN, async (route) => {
    const payload = generateMinimalSNAPayload();
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(payload), headers: { 'Content-Length': String(payload.length) } });
  });

  // Also handle archive.org/download alternative URL
  await page.route(/archive\.org\/download\/([^/]+)\/(.+)/, async (route) => {
    const payload = generateMinimalSNAPayload();
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(payload), headers: { 'Content-Length': String(payload.length) } });
  });

  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();

  // Run flow
  await openTapeLibrary(page);
  await performSearch(page, 'SNA Test');
  await openDetail(page);

  // Load SNA
  await loadSNA(page);

  // Verify RAM at 0x4000 applied (peekMemory helper returns array)
  await page.waitForFunction(() => {
    try{
      return !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.peekMemory === 'function' && window.__ZX_DEBUG__.peekMemory(0x4000,1)[0] === 0xAA);
    }catch(e){ return false; }
  }, { timeout: 2000 });

  // Ensure canvas has focus
  const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  expect(activeId).toBe('screen');

  // Ensure keyboard helper exists and can be invoked
  const pressed = await page.evaluate(() => {
    try{ if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') { window.__ZX_DEBUG__.pressKey('L'); return true; } }catch(e){ return false; }
    return false;
  });
  expect(pressed).toBe(true);
});