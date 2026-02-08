// @e2e @tape @accessibility
import { test, expect } from '@playwright/test';

const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;

const TEST_IDENTIFIER = 'zx_Jet_Set_Willy_1984_Software_Projects_cr';

const MOCK_SEARCH_RESPONSE = {
  responseHeader: { status: 0 },
  response: { numFound: 1, start: 0, docs: [{ identifier: TEST_IDENTIFIER, title: 'Jet Set Willy', creator: 'Software Projects', mediatype: 'software', format: ['Z80 Snapshot'], publicdate: '2014-01-06T00:00:00Z' }] }
};

const MOCK_METADATA_RESPONSE = {
  metadata: { title: 'Jet Set Willy', creator: 'Software Projects', description: 'Classic ZX Spectrum platform game.' },
  files: [ { name: 'Jet_Set_Willy.z80', source: 'original', format: 'Z80 Snapshot', size: '49179' } ]
};

test('tape-detail-description is not visible in detail panel', async ({ page }) => {
  // Route stubs
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH_RESPONSE) });
  });
  await page.route(METADATA_URL_PATTERN, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA_RESPONSE) });
  });

  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();

  // Open Tape Library
  const tapeLibraryButton = page.locator('button:has-text("Tape Library")');
  await expect(tapeLibraryButton).toBeVisible();
  await tapeLibraryButton.click();
  await expect(page.locator('.tape-ui')).toBeVisible();

  // Perform search
  const searchInput = page.locator('input.tape-search-input');
  await searchInput.fill('Jet Set Willy');
  await page.locator('button.tape-search-btn').click();

  // Wait for results
  await expect(page.locator(`.tape-result-item[data-id="${TEST_IDENTIFIER}"]`)).toBeVisible();

  // Open detail (use direct DOM click to avoid diagnostics overlay intercepting pointer events)
  await page.locator('.tape-result-details-btn').evaluate((btn) => btn.click());
  await expect(page.locator('.tape-detail')).toBeVisible();

  // Assert description element is not visible or is hidden from accessibility tree
  const descLocator = page.locator('.tape-detail-description');
  // Either removed or hidden
  await expect(descLocator).toBeHidden();
  const ariaHidden = await descLocator.getAttribute('aria-hidden');
  if (ariaHidden !== null) {
    expect(ariaHidden).toBe('true');
  }
});