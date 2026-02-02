// @e2e @ui
import { test, expect } from '@playwright/test';

test.describe('Reset button reload behavior @ui', () => {
  test('Reset triggers cache clear + reload (same as Clear cache & reload) @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for boot to complete and emulator to expose API
    await page.waitForTimeout(2000);

    // Instrument: set a flag on window before clicking reset so we can detect reload cleared it
    await page.evaluate(() => { window.__PRE_RESET_FLAG__ = Math.random().toString(36).slice(2); });
    const before = await page.evaluate(() => window.__PRE_RESET_FLAG__);
    expect(before).toBeTruthy();

    // Click Reset button which should call clear & reload
    await page.click('#resetBtn');

    // Wait for navigation (reload)
    await page.waitForNavigation({ waitUntil: 'load' });

    // After reload, __PRE_RESET_FLAG__ should be undefined (page reloaded)
    const after = await page.evaluate(() => window.__PRE_RESET_FLAG__);
    expect(after).toBeUndefined();

    // Additionally, emulator should be re-created after reload (spec48 auto-load path)
    // allow some time for the page to finish loading and auto-start
    await page.waitForTimeout(2000);
    const hasEmu = await page.evaluate(() => typeof window.emulator === 'object' && !!window.emulator);
    expect(hasEmu).toBe(true);
  });
});