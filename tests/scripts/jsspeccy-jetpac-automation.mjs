import { chromium } from 'playwright';

// Automate JSSpeccy -> Find Games -> Jetpac -> START (5)
// Usage: node tests/scripts/jsspeccy-jetpac-automation.mjs

(async () => {
  // allow running headed via `--headed` or `HEADLESS=0` (default is headless)
  const headed = process.argv.includes('--headed') || process.env.HEADLESS === '0' || process.env.HEADLESS === 'false';
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  // Allow overriding the reference runtime (local instrumented copy) via REFERENCE_URL
  const url = process.env.REFERENCE_URL || 'https://jsspeccy.zxdemo.org/';
  console.log('Opening', url, headed ? '(headed)' : '(headless)');
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(400);

  const clickTextOrCoords = async (text, opts = {}) => {
    const loc = page.locator(`text=${text}`).first();
    if (await loc.count()) {
      try {
        await loc.click({ force: true, ...opts });
        return true;
      } catch (err) {
        // fallback to clicking by center rect if visible in DOM
        const rect = await page.evaluate((t) => {
          const n = Array.from(document.querySelectorAll('*')).find(e => (e.textContent || '').trim().startsWith(t));
          if (!n) return null;
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }, text).catch(() => null);
        if (rect && rect.w && rect.h) {
          await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);
          return true;
        }
      }
    }
    return false;
  };

  // 1) Click Machine -> select Spectrum 48K
  console.log('Selecting Machine -> Spectrum 48K');
  await clickTextOrCoords('Machine').catch(() => {});
  await page.waitForTimeout(180);
  // prefer the explicit menu item text
  if (!(await clickTextOrCoords('Spectrum 48K'))) {
    // try the bullet-prefixed label used by some builds
    await clickTextOrCoords('• Spectrum 128K').catch(() => {});
  }
  await page.waitForTimeout(200);

  // 2) Click File -> Find games...
  console.log('Opening File -> Find games...');
  await clickTextOrCoords('File').catch(() => {});
  await page.waitForTimeout(120);
  await clickTextOrCoords('Find games...').catch(() => {});
  await page.waitForTimeout(240);

  // 3) Locate the search input (best-effort) and type 'Jetpac'
  let searchInput = null;
  try {
    searchInput = page.locator('input[type="search"], input[placeholder*=Search], input[role="searchbox"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 2500 });
  } catch (e) { searchInput = null; }

  if (searchInput && (await searchInput.count())) {
    console.log('Filling search input with "Jetpac"');
    await searchInput.fill('Jetpac');
    await page.keyboard.press('Enter');
  } else {
    // fallback: send typed characters (some UI capture keyboard events)
    console.log('Search input not found — typing "Jetpac" into page (fallback)');
    await page.keyboard.type('Jetpac', { delay: 80 });
    await page.keyboard.press('Enter');
  }

  // optional: click explicit Search button if present
  try {
    const searchBtn = page.locator('button[type="submit"], text=Search').first();
    if (await searchBtn.count()) { await searchBtn.click({ force: true }); }
  } catch (e) { /* ignore */ }

  // 4) Wait for results and click the exact link `Jetpac [a][16K]` in the results list
  console.log('Waiting for search results — target exact "Jetpac [a][16K]"');
  await page.waitForTimeout(800);

  // prefer exact anchor text inside a result list item
  const exactLocator = page.locator('li:has-text("Jetpac [a][16K]") >> a, a:has-text("Jetpac [a][16K]")').first();
  if (await exactLocator.count()) {
    try {
      await exactLocator.waitFor({ state: 'visible', timeout: 6000 });
      await exactLocator.click({ force: true });
      console.log('Clicked exact "Jetpac [a][16K]" link');
    } catch (err) {
      console.log('Exact link click failed — attempting to click parent li');
      const parent = page.locator('li:has-text("Jetpac [a][16K]")').first();
      if (await parent.count()) await parent.click({ force: true }).catch(() => {});
    }
  } else {
    // Debug: enumerate nodes that mention 'Jetpac' so we can inspect what the UI returned
    const found = await page.$$eval('*', els => els.filter(n => /jetpac/i.test(n.textContent || '')).map(n => ({ tag: n.tagName, text: (n.textContent||'').trim().slice(0,120) })).slice(0,40));
    console.log('Search-result nodes containing "Jetpac":', JSON.stringify(found, null, 2));

    // Fallback: click the first visible element that contains 'Jetpac'
    const anyJet = page.locator('text=Jetpac').first();
    if (await anyJet.count()) {
      await anyJet.click({ force: true }).catch(() => {});
      console.log('Clicked fallback Jetpac element');
    } else {
      console.log('No clickable Jetpac element found in results');
    }
  }

  // 5) Wait for emulator canvas to appear and settle
  console.log('Waiting for emulator canvas / screen');
  try { await page.waitForSelector('#screen, canvas', { timeout: 8000 }); } catch (e) { /* ignore */ }
  // 6) Press START (5) — mimic what works in your test: click → focus → press + repeat
  console.log('[STEP 6] Activating canvas and sending START (5) — time:', new Date().toISOString());

  const canvasLocator = page.locator('canvas').first();
  await canvasLocator.waitFor({ state: 'visible', timeout: 15000 }).catch(() => console.log('[ERROR] No canvas visible after 15s'));

  await page.waitForTimeout(2000); // loader / snapshot apply time

  const logFocus = async (msg) => {
    const active = await page.evaluate(() => document.activeElement ? (document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '')) : 'none');
    console.log('[FOCUS]', msg, active);
  };

  await logFocus('initial');

  // Helpers required by the START attempts: sampleCanvas, saveShot, detectCanvasChangeSince
  const sampleCanvas = async () => await page.evaluate(() => {
    try {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const ctx = c.getContext('2d');
      const img = ctx.getImageData(0, 0, c.width, c.height);
      let sum = 0, nonZero = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        const v = img.data[i] + img.data[i+1] + img.data[i+2];
        sum += v; if (v !== 0) nonZero++;
      }
      return { sum, nonZero };
    } catch (e) { return null; }
  });

  const saveShot = async (name) => {
    const p = `tmp/jsspeccy-jetpac-${name}.png`;
    try { await page.screenshot({ path: p, fullPage: false }); console.log('Saved', p); } catch (e) { console.log('screenshot failed', String(e)); }
  };

  const detectCanvasChangeSince = async (baselineSummary, timeoutMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const cur = await sampleCanvas();
      if (!cur || !baselineSummary) return !!cur;
      const sumDiff = Math.abs((cur.sum || 0) - (baselineSummary.sum || 0));
      const nzDiff = Math.abs((cur.nonZero || 0) - (baselineSummary.nonZero || 0));
      if (sumDiff > 2000 || nzDiff > 50) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };

  // Baseline + debug screenshot
  const baseline2 = await sampleCanvas();
  console.log('[DEBUG] Canvas baseline:', baseline2);
  await saveShot('baseline-before-press');

  // Try up to 4 activation+press cycles
  let started = false;
  for (let attempt = 1; attempt <= 4 && !started; attempt++) {
    console.log(`[ATTEMPT ${attempt}] Activating + sending '5'`);

    // real user-like activation
    await canvasLocator.click({ force: true, position: { x: 160, y: 120 } }).catch(e => console.log('[CLICK]', e && e.message));
    await page.waitForTimeout(80);
    await canvasLocator.focus().catch(() => {});
    await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) { c.tabIndex = 0; c.focus(); } window.focus(); });
    await page.waitForTimeout(120);
    await logFocus(`after attempt ${attempt}`);

    // prefer element press, fallback to page.keyboard
    await canvasLocator.press('5').catch(() => page.keyboard.press('5').catch(() => {}));

    // fallback: dispatch real DOM KeyboardEvents to the canvas (helps JSSpeccy3 worker-based input)
    try {
      await page.evaluate(() => {
        try {
          const c = document.querySelector('canvas');
          if (!c) return;
          c.tabIndex = c.tabIndex || 0;
          c.focus();
          const keyEvent = (type) => new KeyboardEvent(type, {
            key: '5', code: 'Digit5', keyCode: 53, which: 53,
            bubbles: true, cancelable: true, composed: true, view: window
          });
          c.dispatchEvent(keyEvent('keydown'));
          c.dispatchEvent(keyEvent('keypress'));
          setTimeout(() => c.dispatchEvent(keyEvent('keyup')), 60);
        } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }

    // hold variant on even attempts
    if (attempt % 2 === 0) { await page.keyboard.down('5'); await page.waitForTimeout(70); await page.keyboard.up('5'); }

    await page.waitForTimeout(400);
    const changed = await detectCanvasChangeSince(baseline2, 3500);
    console.log(`[RESULT ${attempt}] Visual change:`, changed);

    await saveShot(`after-attempt-${attempt}`);
    if (changed) { await saveShot(`started-on-attempt-${attempt}`); started = true; break; }
    await page.waitForTimeout(300);
  }

  if (!(await detectCanvasChangeSince(baseline2, 6000))) console.log('[WARN] No reliable visual change after multiple attempts');

  console.log('[FINAL] START sequence complete — started =', started);

  // final safety wait so you can watch (10s total after attempts)
  console.log('Final wait 10s (watch the canvas)');
  await page.waitForTimeout(10000);

  // 7) Collect diagnostics and screenshot

  // 7) Collect diagnostics and screenshot
  const diag = await page.evaluate(() => {
    const maybe = window.emu || window.Speccy || window.speccy || window.jsSpeccy || window.JSSpeccy || window.SpeccyJS;
    const out = { emuFound: !!maybe, jetpacInDOM: Array.from(document.querySelectorAll('*')).some(n => /jetpac/i.test(n.textContent || '')) };
    try { out.screenExists = !!document.querySelector('#screen') || !!document.querySelector('canvas'); } catch (e) {}
    try { out.status = maybe ? { running: !!maybe._running, PC: maybe.cpu ? maybe.cpu.PC : null } : null; } catch (e) {}

    // try the obvious accessors first (backwards-compatible)
    try { out.mem4800 = (maybe && maybe.memory && maybe.memory.pages) ? Array.from(maybe.memory.pages[1].slice(0x4800 - 0x4000, 0x4800 - 0x4000 + 64)) : null; } catch (e) { out.mem4800 = null; }
    try { out.memWrites = (maybe && maybe.memory && Array.isArray(maybe.memory._memWrites)) ? maybe.memory._memWrites.slice(-128) : null; } catch (e) { out.memWrites = null; }
    try { out.portWrites = (maybe && Array.isArray(maybe._portWrites)) ? maybe._portWrites.slice(-128) : null; } catch (e) { out.portWrites = null; }
    try { out.soundToggles = (maybe && maybe.sound && Array.isArray(maybe.sound._toggles)) ? maybe.sound._toggles.slice(-128) : null; } catch (e) { out.soundToggles = null; }

    // Exhaustively scan window globals for emulator-like objects and memory/pages
    const scan = [];
    try {
      const keys = Object.keys(window).slice(0, 400); // limit scope
      for (const k of keys) {
        try {
          const v = window[k];
          if (!v || typeof v !== 'object') continue;
          const hasMemoryPages = !!(v.memory && v.memory.pages && Array.isArray(v.memory.pages));
          const hasMemWrites = Array.isArray(v._memWrites) || Array.isArray(v.memWrites) || (v.memory && Array.isArray(v.memory._memWrites));
          const hasCPU = !!(v.cpu && (typeof v.cpu.PC !== 'undefined'));
          if (hasMemoryPages || hasMemWrites || hasCPU || (v.sound && Array.isArray(v.sound._toggles))) {
            const item = { key: k, hasMemoryPages, hasMemWrites, hasCPU };
            try { if (hasMemoryPages) item.mem4800 = Array.from(v.memory.pages[1].slice(0x4800 - 0x4000, 0x4800 - 0x4000 + 64)); } catch (e) {}
            try { if (hasMemWrites) item.memWritesTail = (v._memWrites || v.memWrites || (v.memory && v.memory._memWrites)).slice(-64); } catch (e) {}
            try { if (hasCPU) item.cpuPC = v.cpu.PC; } catch (e) {}
            scan.push(item);
          }
        } catch (e) { /* ignore property access errors */ }
      }
    } catch (e) { /* ignore */ }
    out.globalScan = scan;

    // Heuristic: try to find any DOM element with an attached "emu"-like property (rare)
    try {
      const nodes = Array.from(document.querySelectorAll('*')).slice(0,200);
      const nodeHolders = [];
      for (const n of nodes) {
        try {
          const props = Object.keys(n).filter(p => /emu|memory|cpu|sound/i.test(p));
          if (props.length) nodeHolders.push({ tag: n.tagName, props: props.slice(0,6) });
        } catch (e) {}
      }
      out.nodeHolders = nodeHolders.slice(0,10);
    } catch (e) { out.nodeHolders = []; }

    return out;
  });

  const shotPath = 'tmp/jsspeccy-jetpac.png';
  try { await page.screenshot({ path: shotPath, fullPage: false }); console.log('Saved', shotPath); } catch (e) { console.log('screenshot failed', String(e)); }

  console.log('JSSpeccy diag:', JSON.stringify(diag, null, 2));

  await browser.close();
  process.exit(0);
})();