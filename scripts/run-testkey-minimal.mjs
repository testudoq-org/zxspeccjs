/* eslint-env node */
/* eslint-disable no-undef */
/* global console */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

(async () => {
  const url = 'http://localhost:8080';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('[page]', msg.text()));
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Wait for bootComplete (best-effort)
  console.log('Waiting for emu bootComplete...');
  try {
    await page.waitForFunction('globalThis.__ZX_DEBUG__ && globalThis.__ZX_DEBUG__.bootComplete === true', { timeout: 30000 });
    console.log('Boot complete detected.');
  } catch (e) {
    console.log('Boot complete not detected within timeout, proceeding anyway.');
  }

  // Trigger key press 'l'
  console.log('Pressing test key l');
  try {
    await page.evaluate(() => { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey('l'); });
  } catch (e) { console.log('pressKey failed', e); }

  // Wait for lastPortRead
  console.log('Waiting for window.__TEST__.lastPortRead...');
  let last = null;
  try {
    await page.waitForFunction('globalThis.__TEST__ && globalThis.__TEST__.lastPortRead !== undefined', { timeout: 5000 });
    last = await page.evaluate(() => window.__TEST__.lastPortRead);
    console.log('Found lastPortRead:', last);
  } catch (e) {
    console.log('Timed out waiting for lastPortRead.');
    try { last = await page.evaluate(() => window.__TEST__ && window.__TEST__.lastPortRead); } catch (err) { /* ignore */ }
  }

  const outDir = path.join(process.cwd(), 'tests', '_artifacts');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}
  const outFile = path.join(outDir, `testkey-diagnostic-minimal-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ url, lastPortRead: last, timestamp: new Date().toISOString() }, null, 2));
  console.log('Wrote diagnostic to', outFile);

  await browser.close();
  process.exit(0);
})();