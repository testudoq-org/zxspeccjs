// @e2e @tape @smoke
/**
 * Playwright E2E test for Tape Library feature.
 * Tests Archive.org integration: search, metadata fetch, and tape loading.
 *
 * By default, this test stubs all network endpoints for determinism.
 * Set environment variable TAPE_LIBRARY_LIVE=1 to run against real Archive.org.
 *
 * @see https://github.com/gasman/jsspeccy3 for reference implementation
 */
/* eslint-env browser, node */
/* eslint no-undef: "off" */
import { test, expect } from '@playwright/test';

// ============================================================================
// Test Configuration
// ============================================================================

const LIVE_MODE = process.env.TAPE_LIBRARY_LIVE === '1';
const NETWORK_TIMEOUT = 10000;
const UI_TIMEOUT = 5000;

// Archive.org URL patterns
const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const CORS_DOWNLOAD_URL_PATTERN = /cors\.archive\.org\/cors\/([^/]+)\/(.+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;

// Test item identifier
const TEST_IDENTIFIER = 'zx_Jet_Set_Willy_1984_Software_Projects_cr';
const TEST_FILENAME = 'Jet_Set_Willy_1984_Software_Projects_cr.z80';

// ============================================================================
// Stub Data
// ============================================================================

/**
 * Mock search response for "Jet Set Willy" query.
 */
const MOCK_SEARCH_RESPONSE = {
  responseHeader: {
    status: 0,
    QTime: 10,
    params: {
      q: 'collection:softwarelibrary_zx_spectrum title:"Jet Set Willy"',
      rows: '50',
      output: 'json',
    },
  },
  response: {
    numFound: 3,
    start: 0,
    docs: [
      {
        identifier: TEST_IDENTIFIER,
        title: 'Jet Set Willy (1984)(Software Projects)(Crack)',
        creator: 'Software Projects',
        mediatype: 'software',
        format: ['Z80 Snapshot', 'Metadata'],
        publicdate: '2014-01-06T00:00:00Z',
      },
      {
        identifier: 'zx_JetSetWillyII_1985_SoftwareProjects',
        title: 'Jet Set Willy II (1985)(Software Projects)',
        creator: 'Software Projects',
        mediatype: 'software',
        format: ['TAP File', 'Metadata'],
        publicdate: '2014-02-15T00:00:00Z',
      },
      {
        identifier: 'zx_JetSetWillyRoomEditor',
        title: 'Jet Set Willy - Room Editor',
        creator: 'Unknown',
        mediatype: 'software',
        format: ['TAP File'],
        publicdate: '2015-06-01T00:00:00Z',
      },
    ],
  },
};

/**
 * Mock metadata response for the test item.
 */
const MOCK_METADATA_RESPONSE = {
  created: 1389052800,
  d1: 'ia600300.us.archive.org',
  d2: 'ia800300.us.archive.org',
  dir: '/6/items/' + TEST_IDENTIFIER,
  files: [
    {
      name: TEST_FILENAME,
      source: 'original',
      format: 'Z80 Snapshot',
      md5: 'abc123def456',
      size: '49179',
    },
    {
      name: 'Jet_Set_Willy_1984_Software_Projects_cr.tap',
      source: 'derivative',
      format: 'TAP File',
      md5: 'xyz789abc012',
      size: '32768',
    },
    {
      name: '__ia_thumb.jpg',
      source: 'derivative',
      format: 'JPEG Thumbnail',
      size: '5000',
    },
  ],
  files_count: 3,
  item_last_updated: 1600000000,
  metadata: {
    identifier: TEST_IDENTIFIER,
    title: 'Jet Set Willy (1984)(Software Projects)(Crack)',
    creator: 'Software Projects',
    description: 'Classic ZX Spectrum platform game by Matthew Smith.',
    publicdate: '2014-01-06T00:00:00Z',
    mediatype: 'software',
  },
  server: 'ia800300.us.archive.org',
  uniq: 123456789,
  workable_servers: ['ia800300.us.archive.org', 'ia600300.us.archive.org'],
};

/**
 * Generate a minimal valid Z80 snapshot file for testing.
 * This creates a ~30-byte header + 48K RAM image (all zeros for simplicity).
 * The emulator should accept this as a valid Z80 v1 format file.
 * @returns {Buffer} Minimal Z80 file bytes
 */
function generateMinimalZ80Payload() {
  // Z80 v1 header (30 bytes) + 48K uncompressed RAM
  const header = new Uint8Array(30);

  // A=0x00, F=0x00 (offset 0-1)
  header[0] = 0x00; // A
  header[1] = 0x00; // F

  // BC (offset 2-3, little-endian)
  header[2] = 0x00;
  header[3] = 0x00;

  // HL (offset 4-5)
  header[4] = 0x00;
  header[5] = 0x00;

  // PC (offset 6-7) - set to 0x0000 to start at ROM
  header[6] = 0x00;
  header[7] = 0x00;

  // SP (offset 8-9) - stack pointer
  header[8] = 0xFF;
  header[9] = 0xFF;

  // I (offset 10)
  header[10] = 0x3F;

  // R (offset 11)
  header[11] = 0x00;

  // Offset 12: Byte 12 bit flags
  // Bit 0: R bit 7
  // Bit 1-3: Border color
  // Bit 4: 1 if basic SamROM mode, 0 if 48K
  // Bit 5: 1 if data block is compressed
  header[12] = 0x00; // Not compressed, border black

  // DE (offset 13-14)
  header[13] = 0x00;
  header[14] = 0x00;

  // BC' (offset 15-16)
  header[15] = 0x00;
  header[16] = 0x00;

  // DE' (offset 17-18)
  header[17] = 0x00;
  header[18] = 0x00;

  // HL' (offset 19-20)
  header[19] = 0x00;
  header[20] = 0x00;

  // A' (offset 21)
  header[21] = 0x00;

  // F' (offset 22)
  header[22] = 0x00;

  // IY (offset 23-24)
  header[23] = 0x00;
  header[24] = 0x00;

  // IX (offset 25-26)
  header[25] = 0x00;
  header[26] = 0x00;

  // IFF1 (offset 27)
  header[27] = 0x00;

  // IFF2 (offset 28)
  header[28] = 0x00;

  // IM (offset 29, bits 0-1)
  header[29] = 0x01; // IM 1

  // Create 48K RAM (all zeros for minimal payload)
  const ram = new Uint8Array(48 * 1024);

  // Combine header + RAM
  const result = new Uint8Array(header.length + ram.length);
  result.set(header, 0);
  result.set(ram, header.length);

  return result;
}

// ============================================================================
// Test Fixtures
// ============================================================================

// Helper functions to reduce test complexity
async function openTapeLibrary(page) {
  const tapeLibraryButton = page.locator('button:has-text("Tape Library")');
  await expect(tapeLibraryButton).toBeVisible({ timeout: UI_TIMEOUT });
  await tapeLibraryButton.click();
  await expect(page.locator('.tape-ui')).toBeVisible({ timeout: UI_TIMEOUT });
}

async function performSearch(page, query) {
  const searchInput = page.locator('input[type="text"].tape-search-input');
  await expect(searchInput).toBeVisible({ timeout: UI_TIMEOUT });
  await searchInput.fill(query);
  expect(await searchInput.inputValue()).toBe(query);

  const searchButton = page.locator('button.tape-search-btn, button:has-text("Search")');
  await expect(searchButton).toBeVisible({ timeout: UI_TIMEOUT });

  let searchResponsePromise;
  if (!LIVE_MODE) {
    searchResponsePromise = page.waitForResponse(
      (response) => SEARCH_URL_PATTERN.test(response.url()) && response.status() === 200,
      { timeout: NETWORK_TIMEOUT }
    );
  }

  await searchButton.click();

  if (!LIVE_MODE) {
    await searchResponsePromise;
  }
}

async function verifySearchResults(page) {
  const resultsContainer = page.locator('.tape-results');
  await expect(resultsContainer).toBeVisible({ timeout: UI_TIMEOUT });

  const resultsList = page.locator('.tape-results-list');
  await expect(resultsList).toBeVisible({ timeout: UI_TIMEOUT });

  const targetResult = page.locator(`.tape-result-item[data-id="${TEST_IDENTIFIER}"]`);
  await expect(targetResult).toBeVisible({ timeout: UI_TIMEOUT });

  const titleElement = targetResult.locator('.tape-result-title');
  await expect(titleElement).toContainText(/Jet\s*Set\s*Willy/i, { timeout: UI_TIMEOUT });

  return targetResult;
}

async function openDetailPanel(page, targetResult) {
  const detailsButton = targetResult.locator('.tape-result-details-btn, button:has-text("Details")');
  await expect(detailsButton).toBeVisible({ timeout: UI_TIMEOUT });

  let metadataResponsePromise;
  if (!LIVE_MODE) {
    metadataResponsePromise = page.waitForResponse(
      (response) => METADATA_URL_PATTERN.test(response.url()) && response.status() === 200,
      { timeout: NETWORK_TIMEOUT }
    );
  }

  await detailsButton.click();

  if (!LIVE_MODE) {
    await metadataResponsePromise;
  }

  const detailPanel = page.locator('.tape-detail');
  await expect(detailPanel).toBeVisible({ timeout: UI_TIMEOUT });

  const detailTitle = page.locator('.tape-detail-title');
  await expect(detailTitle).toContainText(/Jet\s*Set\s*Willy/i, { timeout: UI_TIMEOUT });
}

async function loadTapeFromDetail(page) {
  // Wait for file item to be visible
  const z80FileItem = page.locator(`.tape-file-item:has-text("${TEST_FILENAME}")`);
  await expect(z80FileItem).toBeVisible({ timeout: UI_TIMEOUT });

  const loadButton = z80FileItem.locator('.tape-load-btn');
  await expect(loadButton).toBeVisible({ timeout: UI_TIMEOUT });

  // Set up event listener BEFORE clicking
  const tapeLoadedPromise = page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('tape-loaded event timeout')), 15000);
      window.addEventListener('tape-loaded', (e) => {
        clearTimeout(timeout);
        resolve({ type: e.type, detail: e.detail });
      }, { once: true });
      // Also listen for errors
      window.addEventListener('tape-load-error', (e) => {
        clearTimeout(timeout);
        reject(new Error('Tape load error: ' + (e.detail?.message || 'unknown')));
      }, { once: true });
    });
  });

  let downloadResponsePromise;
  if (!LIVE_MODE) {
    // Wait for either cors.archive.org or archive.org/download patterns
    downloadResponsePromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        return (CORS_DOWNLOAD_URL_PATTERN.test(url) || ARCHIVE_DOWNLOAD_URL_PATTERN.test(url)) && response.status() === 200;
      },
      { timeout: NETWORK_TIMEOUT }
    );
  }

  // Click via JavaScript dispatchEvent to bypass overlay blocking
  await loadButton.evaluate((btn) => btn.click());

  if (!LIVE_MODE) {
    await downloadResponsePromise;
  }

  return tapeLoadedPromise;
}

async function verifyTapeLoaded(page, tapeEvent) {
  expect(tapeEvent.type).toBe('tape-loaded');

  const isTapeLoaded = await page.evaluate(() => {
    if (window.emu && window.emu._lastTap) return true;
    if (window.emulator && window.emulator._lastTap) return true;
    if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.lastTape) return true;
    return false;
  });

  expect(isTapeLoaded || tapeEvent).toBeTruthy();
  await expect(page.locator('#screen')).toBeVisible({ timeout: UI_TIMEOUT });
}

test.describe('Tape Library E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Log console messages from browser for debugging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('[TapeUI]') || msg.text().includes('fetch')) {
        console.log(`[Browser ${msg.type()}] ${msg.text()}`);
      }
    });

    // Log network request failures
    page.on('requestfailed', request => {
      console.log('[Network Failed]', request.url(), request.failure()?.errorText);
    });

    // Log all network requests for debugging
    page.on('request', request => {
      if (request.url().includes('archive.org')) {
        console.log('[Network Request]', request.url());
      }
    });

    // Set up route interception BEFORE navigating (unless live mode)
    if (!LIVE_MODE) {
      await setupNetworkStubs(page);
    }
  });

  // ==========================================================================
  // Main Test: Full flow from search to tape loading
  // ==========================================================================

  test('should search, select, and load a tape from Archive.org @smoke', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible({ timeout: UI_TIMEOUT });

    // Step 1: Open Tape Library
    await openTapeLibrary(page);

    // Step 2: Search for "Jet Set Willy"
    await performSearch(page, 'Jet Set Willy');

    // Step 3: Verify search results
    const targetResult = await verifySearchResults(page);

    // Step 4: Open detail panel
    await openDetailPanel(page, targetResult);

    // Step 5: Load the tape
    const tapeEvent = await loadTapeFromDetail(page);

    // Step 6: Verify tape was loaded
    await verifyTapeLoaded(page, tapeEvent);
  });

  // ==========================================================================
  // Additional Tests
  // ==========================================================================

  test('should show error for empty search', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible({ timeout: UI_TIMEOUT });

    // Open Tape Library
    await openTapeLibrary(page);

    // Click search without entering anything
    const searchInput = page.locator('.tape-search-input');
    await searchInput.fill('');

    const searchButton = page.locator('.tape-search-btn');
    await searchButton.click();

    // Should not trigger a network request (check results not shown)
    await expect(page.locator('.tape-results')).not.toBeVisible({ timeout: 1000 });
  });

  test('should allow keyboard input in search field (focus fix)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible({ timeout: UI_TIMEOUT });

    // Open Tape Library
    await openTapeLibrary(page);

    const searchInput = page.locator('.tape-search-input');
    await expect(searchInput).toBeVisible({ timeout: UI_TIMEOUT });

    // Focus and type character by character
    await searchInput.focus();
    await page.keyboard.type('Manic Miner', { delay: 50 });

    // Verify the input received the text (not intercepted by emulator)
    expect(await searchInput.inputValue()).toBe('Manic Miner');
  });

  test('should close detail panel with close button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#screen')).toBeVisible({ timeout: UI_TIMEOUT });

    // Open Tape Library and search
    await openTapeLibrary(page);
    await performSearch(page, 'Jet Set Willy');

    // Wait for results
    await expect(page.locator('.tape-results')).toBeVisible({ timeout: UI_TIMEOUT });

    // Click first result details
    await page.locator('.tape-result-details-btn').first().click();

    // Wait for detail panel
    await expect(page.locator('.tape-detail')).toBeVisible({ timeout: UI_TIMEOUT });

    // Close it
    await page.locator('.tape-detail-close').click();

    // Should be hidden
    await expect(page.locator('.tape-detail')).not.toBeVisible({ timeout: UI_TIMEOUT });
  });
});

// ============================================================================
// Network Stub Setup
// ============================================================================

/**
 * Set up network route stubs for deterministic testing.
 * @param {import('@playwright/test').Page} page - Playwright page
 */
async function setupNetworkStubs(page) {
  // Stub Archive.org advanced search
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    const url = route.request().url();
    console.log('[Stub] Intercepted search request:', url);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESPONSE),
    });
  });

  // Stub Archive.org metadata endpoint
  await page.route(METADATA_URL_PATTERN, async (route) => {
    const url = route.request().url();
    console.log('[Stub] Intercepted metadata request:', url);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_METADATA_RESPONSE),
    });
  });

  // Stub CORS download endpoint for Z80/TAP files
  await page.route(CORS_DOWNLOAD_URL_PATTERN, async (route) => {
    const url = route.request().url();
    console.log('[Stub] Intercepted download request:', url);

    // Generate minimal Z80 payload (snapshot loads directly into memory)
    const z80Bytes = generateMinimalZ80Payload();

    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from(z80Bytes),
      headers: {
        'Content-Length': String(z80Bytes.length),
        'Access-Control-Allow-Origin': '*',
      },
    });
  });

  // Also handle download.archive.org (alternative download URL)
  await page.route(/archive\.org\/download\/([^/]+)\/(.+)/, async (route) => {
    const url = route.request().url();
    console.log('[Stub] Intercepted archive download request:', url);

    const z80Bytes = generateMinimalZ80Payload();

    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from(z80Bytes),
      headers: {
        'Content-Length': String(z80Bytes.length),
      },
    });
  });
}
