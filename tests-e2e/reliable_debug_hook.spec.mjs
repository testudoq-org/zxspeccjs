// @e2e @ui
// Test to verify the reliable debug hook implementation for PC monitoring
import { test, expect } from '@playwright/test';

test.describe('Reliable Debug Hook Implementation', () => {
  test('PC watcher should track every instruction execution', async ({ page }) => {
    // Navigate to emulator
    await page.goto('http://localhost:8080/');

    // Wait for emulator to load
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Check that PC watcher is initialized
    const pcWatcherExists = await page.evaluate(() => {
      return window.__PC_WATCHER__ !== undefined && 
             window.__PC_WATCHER__.history !== undefined;
    });

    expect(pcWatcherExists, 'PC watcher should be initialized').toBe(true);

    // Check that LAST_PC is initialized
    const lastPcExists = await page.evaluate(() => {
      return window.__LAST_PC__ !== undefined;
    });

    expect(lastPcExists, 'LAST_PC should be initialized').toBe(true);

    // Run emulator for a short time to generate some PC updates
    await page.evaluate(() => {
      if (window.emu && window.emu.start) {
        window.emu.start();
      }
    });

    // Wait for some instructions to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that PC history is being populated
    const pcHistory = await page.evaluate(() => {
      return window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.slice() : [];
    });

    expect(Array.isArray(pcHistory)).toBe(true);
    expect(pcHistory.length).toBeGreaterThan(0);
  });
});
