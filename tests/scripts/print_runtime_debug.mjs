import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = process.env.PW_BASE_URL || 'http://127.0.0.1:8080/';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'load', timeout: 10000 });
  await page.waitForSelector('#screen', { timeout: 10000 }).catch(() => {});
  // give the app a moment to initialize
  await page.waitForTimeout(300);

  // Press START (5)
  await page.keyboard.press('5').catch(() => {});
  await page.evaluate(() => { try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('5'); } catch (e) {} });
  await page.waitForTimeout(600);

  const dbg = await page.evaluate(() => {
    try {
      return {
        emuRunning: !!(window.emu && window.emu._running),
        portWrites: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites)) ? window.__ZX_DEBUG__.portWrites.slice(-16) : (window.emu && Array.isArray(window.emu._portWrites) ? window.emu._portWrites.slice(-16) : []),
        soundToggles: (window.emu && window.emu.sound && Array.isArray(window.emu.sound._toggles)) ? window.emu.sound._toggles.slice(-16) : [],
        memWritesTail: (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites)) ? window.__ZX_DEBUG__.memWrites.slice(-32) : (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites) ? window.emu.memory._memWrites.slice(-32) : [])
      };
    } catch (e) { return { error: String(e) }; }
  });

  // save a post-start screenshot for offline inspection
  try {
    await page.screenshot({ path: 'tmp/jetpac-post-start.png', fullPage: false });
    // eslint-disable-next-line no-console
    console.log('Saved post-start screenshot to tmp/jetpac-post-start.png');
  } catch (e) { /* ignore */ }

  console.log('--- runtime debug ---');
  console.log('emuRunning:', dbg.emuRunning);
  console.log('portWrites (tail):', JSON.stringify(dbg.portWrites, null, 2));
  console.log('soundToggles (tail):', JSON.stringify(dbg.soundToggles, null, 2));
  console.log('memWritesTail (tail):', JSON.stringify(dbg.memWritesTail, null, 2));

  await browser.close();
  process.exit(0);
})();