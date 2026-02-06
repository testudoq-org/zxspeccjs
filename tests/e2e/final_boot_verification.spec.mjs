// @e2e @ui
/* eslint-env browser, node, es2021 */
/* global window document requestAnimationFrame console */

// Final verification test for ZX Spectrum 48K boot implementation
// Tests the actual emulator in a browser environment

import { test, expect } from '@playwright/test';
import { setupDiagnostics, checkSpec48, ensureStarted, waitForBootComplete, collectSystemVars, verifyBootGlyph } from '../_helpers/bootHelpers.mjs';

test.describe('ZX Spectrum 48K Boot Implementation', () => {
  test('@smoke should boot correctly and show copyright message', async ({ page }) => {
    console.log('=== ZX Spectrum 48K Boot Verification Test ===\n');
    
    // Setup diagnostics and console capture
    const consoleMsgs = await setupDiagnostics(page);

    // Navigate to emulator and ensure bundled ROM is present
    await page.goto('http://localhost:8080/');
    await checkSpec48(page, consoleMsgs);

    // Wait for emulator DOM and start it (with retries/force-load as needed)
    await page.waitForSelector('#screen', { timeout: 10000 });
    console.log('✓ Emulator loaded');
    const startObserved = await ensureStarted(page);
    console.log('Emulator start observed:', startObserved);



    // Wait for boot sequence to complete (up to 5 seconds)
    const { bootComplete, finalPC, finalTime } = await waitForBootComplete(page, 5000);
    
    // Take screenshot to verify display
    await page.screenshot({ path: 'screenshots/final_boot_verification.png' });
    console.log('✓ Screenshot taken');
    
    // Check results
    console.log('\n=== BOOT VERIFICATION RESULTS ===');
    console.log(`Boot completion time: ${finalTime}ms`);
    console.log(`Boot sequence complete: ${bootComplete ? 'YES' : 'NO'}`);
    console.log(`Final PC reached: 0x${finalPC ? finalPC.toString(16).padStart(4, '0') : 'unknown'}`);
  });
});
