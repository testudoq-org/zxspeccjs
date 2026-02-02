// @e2e @ui
import { test } from '@playwright/test';

test('debug page load - capture console errors', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    logs.push({ type: 'pageerror', text: String(err), stack: err.stack });
  });

  // collect loaded script tags for debugging
  const scripts = await page.evaluate(() => Array.from(document.querySelectorAll('script')).map(s => ({ src: s.src || null, type: s.type || null, outer: s.outerHTML.slice(0,200) })));
  console.log('PAGE: scripts', scripts);

  const resp = await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded', timeout: 10000 });
  // wait briefly for initialization
  await page.waitForTimeout(1000);

  const docHtml = await page.evaluate(() => ({
    htmlLen: document.documentElement ? document.documentElement.outerHTML.length : 0,
    headSnippet: document.head ? document.head.innerHTML.slice(0,400) : null,
    bodySnippet: document.body ? document.body.innerHTML.slice(0,400) : null
  }));
  console.log('PAGE: document size/snippet', docHtml);

  // Snapshot presence of canvas and rom-select
  const present = await page.evaluate(() => ({
    canvas: !!document.getElementById('screen'),
    romSelect: !!document.getElementById('rom-select'),
    emulatorExposed: !!window.emulator,
    zxDebug: !!window.__ZX_DEBUG__
  }));
  console.log('PAGE: navigation status', { ok: resp.ok(), status: resp.status() });

  // Check presence and type of frameBuffer helper
  try {
    const fnType = await page.evaluate(() => {
      try {
        const fb = window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer;
        if (!fb) return { has: false };
        const ownProps = Object.getOwnPropertyNames(fb);
        const proto = Object.getPrototypeOf(fb) || {};
        return { has: true, ownProps, protoHas: typeof proto._notifyFrameGenerated, ownValue: fb._notifyFrameGenerated, protoNames: Object.getOwnPropertyNames(proto) };
      } catch (e) { return { error: String(e) }; }
    });
    console.log('PAGE: frameBuffer._notifyFrameGenerated', fnType);

    // Fetch the source text to ensure method is present in the served file
    const srcInfo = await page.evaluate(async () => {
      const r = await fetch('/src/frameBuffer.mjs');
      const t = await r.text();
      return { status: r.status, len: t.length, hasNotify: t.includes('_notifyFrameGenerated') };
    });
    console.log('PAGE: /src/frameBuffer.mjs', srcInfo);
  } catch (e) { console.log('PAGE: failed to inspect frameBuffer helper', String(e)); }

  console.log('PAGE: presence', present);
  console.log('PAGE LOGS:', JSON.stringify(logs, null, 2));

  // Fail test if critical items missing
  if (!present.canvas || !present.romSelect) throw new Error('Canvas or ROM selector missing: ' + JSON.stringify(present));
});
