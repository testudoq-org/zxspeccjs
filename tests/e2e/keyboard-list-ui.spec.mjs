import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../tests/_helpers/bootHelpers.mjs';

// This test confirms the debug UI shows "LIST" when 'L' is pressed
test('keyboard UI shows LIST on L keypress @ui', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });

  // Start emulator
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Focus canvas and press 'l'
  await page.locator('canvas').click();
  await page.keyboard.press('l');

  // Wait for the keyword overlay to appear and assert content
  const kw = page.locator('#__emu_keyword');
  await expect(kw).toBeVisible({ timeout: 2000 });
  await expect(kw).toHaveText('LIST');
});