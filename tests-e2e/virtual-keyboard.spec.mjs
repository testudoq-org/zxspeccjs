// @e2e @ui
import { test, expect } from '@playwright/test';

test.describe('Virtual keyboard IME / mobile interaction @ui', () => {
  test('pointerdown focuses hidden input and pointerup blurs (mobile/softkeyboard behavior) @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.zxvk-overlay', { timeout: 10000 });

    // pick a visible key (q)
    const btn = page.locator('.zxvk-overlay button[data-key="q"]');
    await expect(btn).toBeVisible();

    // pointerdown should focus the hidden input and register a press
    await btn.dispatchEvent('pointerdown');

    // Open diagnostic status panel before pressing so it doesn't steal focus afterwards
    const statusBtn = page.locator('#__emu_btn_input_status');
    await expect(statusBtn).toBeVisible();
    await statusBtn.click();
    const lastSpan = page.locator('#__emu_input_last');
    const focusedSpan = page.locator('#__emu_input_focused');

    // Now pointerdown should focus hidden input and update status
    await btn.dispatchEvent('pointerdown');

    const activeId = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(activeId).toBe('__emu_hidden_input');

    const pressed = await page.evaluate(() => !!(window.__TEST__ && window.__TEST__.keyEvents && window.__TEST__.keyEvents.some(ev => ev.type === 'press' && ev.key === 'q')));
    expect(pressed).toBe(true);

    await expect(lastSpan).toHaveText(/q|\(none\)/, { timeout: 2000 });
    await expect(focusedSpan).toHaveText('true');

    // pointerup should release and blur
    await btn.dispatchEvent('pointerup');

    const afterActive = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(afterActive).not.toBe('__emu_hidden_input');

    const released = await page.evaluate(() => !!(window.__TEST__ && window.__TEST__.keyEvents && window.__TEST__.keyEvents.some(ev => ev.type === 'release' && ev.key === 'q')));
    expect(released).toBe(true);

    // Check status reflects blur
    await expect(focusedSpan).toHaveText('false');
  });

  test('hidden input input/composition events map to key presses (IME) @ui', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#__emu_hidden_input', { timeout: 10000 });

    // Simulate IME compositionend event delivering 'a'
    const result = await page.evaluate(() => {
      const inp = document.getElementById('__emu_hidden_input');
      if (!inp) return { ok: false };
      // emulate compositionend
      const ev = new CompositionEvent('compositionend', { data: 'a', bubbles: true });
      inp.dispatchEvent(ev);
      // Also input event path
      inp.value = 'a';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true, events: (window.__TEST__ && window.__TEST__.keyEvents) ? window.__TEST__.keyEvents.slice(-5) : [] };
    });

    expect(result.ok).toBe(true);
    // last events should include a press/release for 'a'
    const hadPress = (result.events || []).some(ev => ev.type === 'press' && ev.key === 'a');
    expect(hadPress).toBe(true);
  });
});