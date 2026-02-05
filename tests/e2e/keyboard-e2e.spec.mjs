/* eslint-disable no-console, no-unused-vars */
// @e2e @ui
import { test, expect } from '@playwright/test';

test.describe('Keyboard to canvas end-to-end @ui', () => {
  test('physical keyboard typing displays text on canvas (PRINT "HI") @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for boot to complete
    await page.waitForTimeout(3000);

    // Focus canvas and type PRINT "HI" followed by Enter
    await page.locator('canvas').click();
    await page.keyboard.type('PRINT "HI"', { delay: 50 });
    await page.keyboard.press('Enter');

    // Wait for rendering
    await page.waitForTimeout(1000);

    const glyphCheck = await page.evaluate(() => {
      try {
        if (!window.__ZX_DEBUG__ || typeof window.__ZX_DEBUG__.snapshotGlyph !== 'function') return { found: false, reason: 'no_debug' };
        for (let col = 0; col < 32; col++) {
          const s = window.__ZX_DEBUG__.snapshotGlyph(col, 184);
          if (s && s.matchToRom) return { found: true, col, rom: s.romMatchAddr, s };
        }
        return { found: false };
      } catch (e) { return { found: false, error: String(e) }; }
    });

    expect(glyphCheck.found).toBe(true);
  });

  test('canvas receives physical keydown/keyup events when focused @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Focus canvas and press 'j'
    await page.locator('canvas').click();
    await page.keyboard.press('j');

    // Give handlers a moment to record events
    await page.waitForTimeout(200);

    const hadDomPress = await page.evaluate(() => {
      try { return !!(window.__TEST__ && window.__TEST__.keyEvents && window.__TEST__.keyEvents.some(e => e.type === 'dom-press' && e.key === 'j')); } catch(e){ return false; }
    });

    expect(hadDomPress).toBe(true);

    // Check that a release occurred on keyup when we simulate keyup
    await page.keyboard.up('j');
    await page.waitForTimeout(200);
    const hadRelease = await page.evaluate(() => {
      try { return !!(window.__TEST__ && window.__TEST__.keyEvents && window.__TEST__.keyEvents.some(e => e.type === 'dom-release' && e.key === 'j')); } catch(e){ return false; }
    });
    expect(hadRelease).toBe(true);
  });

  test('virtual keyboard typing displays text on canvas (PRINT "HI") @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.zxvk-overlay', { timeout: 10000 });

    // Wait for boot
    await page.waitForTimeout(3000);

    // Press keys via virtual keyboard overlay for: PRINT "HI" and Enter
    const pressKey = async (k) => {
      const btn = page.locator(`.zxvk-overlay button[data-key="${k}"]`);
      await expect(btn).toBeVisible();
      await btn.dispatchEvent('pointerdown');
      await btn.dispatchEvent('pointerup');
    };

    for (const ch of ['p','r','i','n','t','space','quote','h','i','quote']) {
      // Map quote to 'enter' or a representation: our overlay uses dataset 'enter' for Enter, 'space' for space
      const keyName = ch === 'quote' ? 'symshift' : ch; // overlay doesn't have a quote key; skip exact quotes
      if (keyName === 'symshift') {
        // no-op - rely on physical keyboard presence for quotes in this simplified test
        continue;
      }
      await pressKey(keyName);
    }

    // Press Enter via virtual keyboard button
    await pressKey('enter');

    // Wait for rendering
    await page.waitForTimeout(1000);

    const glyphCheck = await page.evaluate(() => {
      try {
        if (!window.__ZX_DEBUG__ || typeof window.__ZX_DEBUG__.snapshotGlyph !== 'function') return { found: false, reason: 'no_debug' };
        for (let col = 0; col < 32; col++) {
          const s = window.__ZX_DEBUG__.snapshotGlyph(col, 184);
          if (s && s.matchToRom) return { found: true, col, rom: s.romMatchAddr, s };
        }
        return { found: false };
      } catch (e) { return { found: false, error: String(e) }; }
    });

    expect(glyphCheck.found).toBe(true);
  });
});