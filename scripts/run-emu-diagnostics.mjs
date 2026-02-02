import fs from 'fs';
import path from 'path';
import playwright from 'playwright';

(async function(){
  const outDir = path.join(process.cwd(), 'tests', '_artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const screenshotPath = path.join(outDir, `canvas-${ts}.png`);
  const charReadsPath = path.join(outDir, `charBitmapReads-${ts}.json`);
  const fbDecisionsPath = path.join(outDir, `frameBufferDecisions-${ts}.json`);
  const fullDiagPath = path.join(outDir, `emu-diagnostics-${ts}.json`);

  const browser = await playwright.chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => console.log('[PAGE]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[PAGE-ERR]', e.message));

  try {
    await page.goto('http://localhost:8080/index.html', { waitUntil: 'load', timeout: 20000 });
    // wait for debug
    for (let i=0;i<60;i++){
      const dbg = await page.evaluate(() => typeof window.__ZX_DEBUG__ !== 'undefined');
      if (dbg) break;
      await page.waitForTimeout(200);
    }

    // wait for bootComplete
    for (let i=0;i<120;i++){
      const boot = await page.evaluate(() => { try { return !!(window.__ZX_DEBUG__ && window.__ZX_DEBUG__.bootComplete === true); } catch(e){return false;} });
      if (boot) break;
      await page.waitForTimeout(200);
    }

    // Force a couple renders
    await page.evaluate(async () => { try { if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { for (let i=0;i<4;i++){ window.emulator.ula.render(); await new Promise(r=>requestAnimationFrame(r)); } } } catch(e){} });

    // collect __TEST__ pieces
    const testObj = await page.evaluate(() => {
      try {
        const t = window.__TEST__ || {};
        const dbg = window.__ZX_DEBUG__ || {};
        const chars = (dbg.peekMemory && typeof dbg.peekMemory === 'function') ? dbg.peekMemory(0x5C36, 2) : null;
        const charsPtr = (chars && chars[1] !== undefined) ? ((chars[1]<<8)|chars[0]) : null;
        const charBitmapReads = t.charBitmapReads || t.charBitmapWrites || null;
        const screenBitmapReads = t.screenBitmapReads || t.screenBitmapWrites || null;
        const frameAutoBackfill = t.frameAutoBackfill || null;
        const frameRenderBackfill = t.frameRenderBackfill || null;
        const frameAutoBackfillSkipped = t.frameAutoBackfillSkipped || null;
        const charsDiag = t.charsDiag || null;
        const frameBufferNonZero = t.lastFrameBitmapNonZero || null;
        return { charsPtr, charBitmapReads, screenBitmapReads, frameAutoBackfill, frameRenderBackfill, frameAutoBackfillSkipped, charsDiag, frameBufferNonZero };
      } catch (e) { return { error: String(e) }; }
    });

    // read ROM/glyph bytes around charsPtr if available
    let romDump = null;
    let ramGlyph = null;
    if (testObj.charsPtr !== null && testObj.charsPtr !== undefined) {
      const ptr = testObj.charsPtr;
      romDump = await page.evaluate((p)=>{
        const dbg = window.__ZX_DEBUG__;
        if (!dbg || typeof dbg.readROM !== 'function') return null;
        const out = [];
        for (let i=0;i<8;i++) out.push(dbg.readROM((0x3C00 + 0x7F*8 + i)&0xffff));
        return out;
      }, ptr);
      ramGlyph = await page.evaluate((p)=>{
        const dbg = window.__ZX_DEBUG__;
        if (!dbg || typeof dbg.peekMemory !== 'function') return null;
        try { return dbg.peekMemory((p + 0x7F*8) & 0xffff, 8); } catch(e) { return null; }
      }, testObj.charsPtr);
    }

    // screenshot
    await page.screenshot({ path: screenshotPath });

    // write artifacts
    fs.writeFileSync(fullDiagPath, JSON.stringify({ collected: testObj, romDump, ramGlyph }, null, 2));
    fs.writeFileSync(charReadsPath, JSON.stringify({ charBitmapReads: testObj.charBitmapReads || null, screenBitmapReads: testObj.screenBitmapReads || null }, null, 2));
    fs.writeFileSync(fbDecisionsPath, JSON.stringify({ frameAutoBackfill: testObj.frameAutoBackfill, frameRenderBackfill: testObj.frameRenderBackfill, frameAutoBackfillSkipped: testObj.frameAutoBackfillSkipped }, null, 2));

    console.log('Wrote artifacts:', { screenshotPath, charReadsPath, fbDecisionsPath, fullDiagPath });
  } catch (e) {
    console.error('error during diagnostics', e);
  } finally {
    await ctx.close();
    await browser.close();
  }
})();
