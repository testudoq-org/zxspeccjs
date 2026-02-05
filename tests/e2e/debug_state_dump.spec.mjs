// @e2e @ui
import { test } from '@playwright/test';

test('dump debug state', async ({ page }) => {
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 10000 });

  const info = await page.evaluate(() => {
    return {
      zx_debug_exists: !!window.__ZX_DEBUG__,
      zx_debug_keys: window.__ZX_DEBUG__ ? Object.keys(window.__ZX_DEBUG__) : null,
      last_pc: window.__LAST_PC__,
      pc_watcher_exists: !!window.__PC_WATCHER__,
      pc_watcher_len: window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.length : null,
      emu_exists: !!window.emu,
      emu_has_cpu: !!(window.emu && window.emu.cpu),
      emu_status: window.emu && typeof window.emu.status === 'function' ? window.emu.status() : null
    };
  });

  console.log('DEBUG_STATE_DUMP_START');
  console.log(JSON.stringify(info, null, 2));
  console.log('DEBUG_STATE_DUMP_END');
});
