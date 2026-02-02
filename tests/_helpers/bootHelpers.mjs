/* eslint-env browser, node, es2021 */
/* global window document performance fetch console */

export async function setupDiagnostics(page) {
  // Install early window error handlers before navigation so we capture module parse errors
  await page.addInitScript(() => {
    window.__INIT_ERRORS__ = [];
    window.addEventListener('error', (e) => {
      try { window.__INIT_ERRORS__.push({ type: 'error', message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack ? e.error.stack : String(e.error) }); } catch (err) { void err; }
    });
    window.addEventListener('unhandledrejection', (ev) => { try { window.__INIT_ERRORS__.push({ type: 'unhandledrejection', reason: String(ev.reason) }); } catch (err) { void err; } });
  });

  const consoleMsgs = [];
  page.on('console', async msg => {
    const loc = msg.location ? msg.location() : null;
    const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => String(a))));
    consoleMsgs.push({ type: msg.type(), text: msg.text(), location: loc, args });
  });
  page.on('pageerror', e => consoleMsgs.push({ type: 'pageerror', text: String(e), stack: e.stack }));
  page.on('requestfailed', req => consoleMsgs.push({ type: 'requestfailed', url: req.url(), method: req.method(), failure: req.failure() }));
  page.on('response', res => consoleMsgs.push({ type: 'response', url: res.url(), status: res.status() }));

  return consoleMsgs;
}

export async function checkSpec48(page, consoleMsgs) {
  const specAvailable = await page.evaluate(() => !!window.spec48);
  if (!specAvailable) {
    const resources = await page.evaluate(() => ({
      scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerText.slice(0,80)),
      resources: (typeof performance !== 'undefined' && performance.getEntriesByType) ? performance.getEntriesByType('resource').map(r => ({ name: r.name, initiatorType: r.initiatorType, transferSize: r.transferSize })) : []
    }));
    console.error('spec48 not available on page; resource list:', JSON.stringify(resources, null, 2));
    if (consoleMsgs && consoleMsgs.length) console.error('Early console logs:', JSON.stringify(consoleMsgs.slice(-50), null, 2));

    try {
      const initErrors = await page.evaluate(() => (window.__INIT_ERRORS__ || []));
      console.error('window.__INIT_ERRORS__:', JSON.stringify(initErrors, null, 2));
    } catch (e) { console.error('[diagnostic] failed to read window.__INIT_ERRORS__:', String(e)); }

    try {
      const url = (window.location && window.location.origin ? window.location.origin : '') + '/src/main.mjs';
      const mainSrc = await fetch(url).then(r => r.text());
      console.error('[diagnostic] /src/main.mjs (first 1000 chars):', mainSrc.slice(0, 1000));
    } catch (e) {
      console.error('[diagnostic] failed to fetch /src/main.mjs:', String(e));
    }
  }
}

export async function ensureStarted(page) {
  // Wait for selector first
  try { await page.waitForSelector('#screen', { timeout: 10000 }); } catch (e) { void e; }

  // Click start and observe running/debug/framebuffer
  await page.click('#startBtn').catch(() => {});

  let startObserved = false;
  try {
    await page.waitForFunction(() => {
      const p = Array.from(document.querySelectorAll('p')).find(el => el && el.textContent && el.textContent.includes('Status:'));
      const statusText = p ? (p.textContent || '').toLowerCase() : '';
      return statusText.includes('running') || !!window.__ZX_DEBUG__ || !!(window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer && window.emulator.ula.frameBuffer.buffer);
    }, { timeout: 3000 });
    startObserved = true;
  } catch (e) {
    console.warn('Start not observed within 3s: retrying #startBtn click and waiting again');
    await page.click('#startBtn').catch(() => {});
    try {
      await page.waitForFunction(() => {
        const p = Array.from(document.querySelectorAll('p')).find(el => el && el.textContent && el.textContent.includes('Status:'));
        const statusText = p ? (p.textContent || '').toLowerCase() : '';
        return statusText.includes('running') || !!window.__ZX_DEBUG__ || !!(window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer && window.emulator.ula.frameBuffer.buffer);
      }, { timeout: 3000 });
      startObserved = true;
    } catch (e2) { void e2; }
  }

  if (!startObserved) {
    console.warn('Start not observed: attempting to force-load spec48 and start the emulator programmatically');
    const forced = await page.evaluate(async () => {
      try {
        if (window.spec48 && window.spec48.bytes && window.emulator && typeof window.emulator.loadROM === 'function') {
          await window.emulator.loadROM(window.spec48.bytes);
          if (typeof window.emulator.start === 'function') window.emulator.start();
          return { forced: true };
        }
        if (window.emulator && typeof window.emulator.start === 'function') {
          window.emulator.start();
          return { forced: true };
        }
      } catch (e) { return { error: String(e) }; }
      return { forced: false };
    });
    console.log('Force load/start result:', forced);

    try { await page.waitForFunction(() => !!(window.__ZX_DEBUG__ || (window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer && window.emulator.ula.frameBuffer.buffer)), { timeout: 3000 }); } catch (e) { void e; }
    const debugNow = await page.evaluate(() => !!window.__ZX_DEBUG__);
    console.log('Debug now available after force attempt:', debugNow);
  }

  return startObserved;
}

export async function waitForBootComplete(page, timeout = 5000) {
  const start = Date.now();
  let bootComplete = false;
  let finalPC = null;

  while (Date.now() - start < timeout) {
    try {
      const debugResult = await page.evaluate(() => {
        const debug = window.__ZX_DEBUG__;
        if (!debug) return { available: false };

        let pc = 0;
        try {
          pc = typeof debug.getCurrentPC === 'function' ? debug.getCurrentPC() : (typeof debug.getPC === 'function' ? debug.getPC() : (debug.registers && debug.registers.PC ? debug.registers.PC : 0));
        } catch (e) { void e; }

        let bootComplete = false;
        try {
          bootComplete = typeof debug.bootComplete === 'function' ? debug.bootComplete() : (debug.bootComplete === true);
        } catch (e) { void e; }

        return { available: true, pc, bootComplete };
      });

      if (debugResult.available) {
        const currentPC = debugResult.pc || 0;
        const bootProgress = { complete: debugResult.bootComplete };

        console.log(`Current PC: 0x${currentPC.toString(16).padStart(4, '0')}, Boot complete: ${bootProgress.complete}`);

        if (bootProgress.complete || currentPC === 0x11CB || currentPC > 0x100) {
          bootComplete = true;
          finalPC = currentPC;
          break;
        }

        if (currentPC === 0x15C4) {
          console.log('✓ Reached copyright display routine at 0x15C4');
        }
      }

      const memoryCheck = await page.evaluate(() => {
        if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.readROM) {
          const addr = 0x153B;
          let text = '';
          for (let i = 0; i < 50; i++) {
            const char = window.__ZX_DEBUG__.readROM(addr + i);
            if (char >= 32 && char <= 126) text += String.fromCharCode(char);
          }
          return text;
        }
        return null;
      });

      if (memoryCheck && memoryCheck.includes('1982')) {
        console.log('✓ Copyright text found in ROM:', memoryCheck.substring(0, 30) + '...');
      }

    } catch (error) {
      console.log('Debug API not ready yet...');
    }

    await page.waitForTimeout(100);
  }

  const finalTime = Date.now() - start;
  return { bootComplete, finalPC, finalTime };
}

export async function verifyBootGlyph(page) {
  // Wait for screen to render boot text (poll up to 5s)
  const waitStart = Date.now();
  const waitTimeout = 5000;
  let screenReady = false;
  while (Date.now() - waitStart < waitTimeout && !screenReady) {
    const fbHas = await page.evaluate(() => {
      const emu = window.emulator || window.emu;
      if (!emu || !emu.ula || !emu.ula.frameBuffer || !emu.ula.frameBuffer.buffer) return false;
      const buf = emu.ula.frameBuffer.buffer;
      const topBorderBytes = 24 * 160;
      const lineStride = 16 + 64 + 16;
      for (let r = 184; r < 192; r++) {
        for (let col = 0; col < 32; col++) {
          const bufferPtr = topBorderBytes + r * lineStride + 16 + col * 2;
          if (buf[bufferPtr] !== 0) return true;
        }
      }
      return false;
    });

    const romHas = await page.evaluate(() => {
      const debug = window.__ZX_DEBUG__;
      if (!debug || typeof debug.readROM !== 'function') return false;
      for (let i = 0x1530; i < 0x1550; i++) if (debug.readROM(i) === 0x7F) return true;
      return false;
    });

    const canvasHas = await page.evaluate(() => {
      try {
        const canvas = document.getElementById('screen');
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const sampleX = Math.max(0, Math.floor(w * 0.05));
        const sampleY = Math.max(0, Math.floor(h * 0.86));
        const sw = Math.min(32, w - sampleX);
        const sh = Math.min(24, h - sampleY);
        const img = ctx.getImageData(sampleX, sampleY, sw, sh);
        const d = img.data;
        const baseR = d[0], baseG = d[1], baseB = d[2];
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] !== baseR || d[i + 1] !== baseG || d[i + 2] !== baseB) return true;
        }
      } catch (e) { void e; }
      return false;
    });

    if (fbHas || romHas || canvasHas) { screenReady = true; break; }
    await page.waitForTimeout(200);
  }

  const glyphCheck = await page.evaluate(() => {
    const debug = window.__ZX_DEBUG__;
    if (!debug || typeof debug.readRAM !== 'function') return { found: false };

    const targetCode = 0x7F;
    const rows = Array.from({length: 8}, (_, i) => 184 + i);

    for (let col = 0; col < 32; col++) {
      let ok = true;
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const r = rows[rIdx];
        const rel = ((r & 0xC0) << 5) + ((r & 0x07) << 8) + ((r & 0x38) << 2) + col;
        const val = debug.readRAM(rel);
        if (val !== targetCode) { ok = false; break; }
      }
      if (ok) return { found: true, col };
    }

    try {
      const canvas = document.getElementById('screen');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const sampleX = Math.max(0, Math.floor(w * 0.05));
        const sampleY = Math.max(0, Math.floor(h * 0.86));
        const sw = Math.min(32, w - sampleX);
        const sh = Math.min(24, h - sampleY);
        const img = ctx.getImageData(sampleX, sampleY, sw, sh);
        const d = img.data;
        const baseR = d[0], baseG = d[1], baseB = d[2];
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] !== baseR || d[i + 1] !== baseG || d[i + 2] !== baseB) return { found: true, canvas: true };
        }
      }
    } catch (e) { void e; }

    return { found: false };
  });

  const romHasCopyright = await page.evaluate(() => {
    const debug = window.__ZX_DEBUG__;
    if (!debug || typeof debug.readROM !== 'function') return false;
    for (let i = 0x1530; i < 0x1550; i++) {
      if (debug.readROM(i) === 0x7F) return true;
    }
    return false;
  });

  // If frame buffer is empty, try forcing an explicit render several times and re-check
  let fbHasText = await page.evaluate(() => {
    const emu = window.emulator || window.emu;
    if (!emu || !emu.ula || !emu.ula.frameBuffer || !emu.ula.frameBuffer.buffer) return false;
    const buf = emu.ula.frameBuffer.buffer;
    const topBorderBytes = 24 * 160;
    const lineStride = 16 + 64 + 16;
    for (let r = 184; r < 192; r++) {
      for (let col = 0; col < 32; col++) {
        const bufferPtr = topBorderBytes + r * lineStride + 16 + col * 2;
        if (buf[bufferPtr] !== 0) return true;
      }
    }
    return false;
  });

  if (!fbHasText) {
    await page.evaluate(() => {
      window.__TEST__ = window.__TEST__ || {};
      window.__TEST__._renderPromise = new Promise((resolve) => { window.__TEST__._renderResolve = resolve; });
      if (typeof window.__TEST__.frameRendered !== 'function') window.__TEST__.frameRendered = () => { if (typeof window.__TEST__._renderResolve === 'function') window.__TEST__._renderResolve(); };
    });

    await page.evaluate(async () => {
      if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') {
        try {
          for (let i = 0; i < 3; i++) {
            window.emulator.ula.render();
            await new Promise(r => requestAnimationFrame(r));
          }
        } catch (e) { void e; }
      }
    });

    await Promise.race([
      page.evaluate(() => window.__TEST__ && window.__TEST__._renderPromise),
      page.waitForTimeout(500)
    ]);

    await page.waitForTimeout(100);

    fbHasText = await page.evaluate(() => {
      const emu = window.emulator || window.emu;
      if (!emu || !emu.ula || !emu.ula.frameBuffer || !emu.ula.frameBuffer.buffer) return false;
      const buf = emu.ula.frameBuffer.buffer;
      const topBorderBytes = 24 * 160;
      const lineStride = 16 + 64 + 16;
      for (let r = 184; r < 192; r++) {
        for (let col = 0; col < 32; col++) {
          const bufferPtr = topBorderBytes + r * lineStride + 16 + col * 2;
          if (buf[bufferPtr] !== 0) return true;
        }
      }
      return false;
    });
  }

  // Run snapshotGlyph across columns to find ROM matches
  const snapshotMatches = await page.evaluate(() => {
    if (!window.__ZX_DEBUG__ || typeof window.__ZX_DEBUG__.snapshotGlyph !== 'function') return { found: false, reason: 'no_debug' };
    const out = { found: false, matches: [] };
    for (let col = 0; col < 32; col++) {
      const s = window.__ZX_DEBUG__.snapshotGlyph(col, 184);
      if (s && s.matchToRom) out.matches.push({ col, rom: s.romMatchAddr, s });
    }
    out.found = out.matches.length > 0;
    return out;
  });

  const pixelCompareResults = [];
  if (snapshotMatches.found) {
    const toCheck = snapshotMatches.matches.slice(0, 3);
    for (const m of toCheck) {
      const cmp = await page.evaluate((col) => {
        if (!window.__ZX_DEBUG__ || typeof window.__ZX_DEBUG__.compareColumnPixels !== 'function') return { error: 'no_compare' };
        return window.__ZX_DEBUG__.compareColumnPixels(col, 184);
      }, m.col);
      pixelCompareResults.push({ col: m.col, cmp });
    }
  }

  // If ROM marker missing, collect diagnostics
  let diag = null;
  if (!romHasCopyright) {
    diag = await page.evaluate(() => {
      const out = {};
      try {
        const dbg = window.__ZX_DEBUG__ || {};
        out.available = Object.keys(dbg);
        if (typeof dbg.readROM === 'function') {
          out.rom = [];
          for (let i = 0x1500; i < 0x1540; i++) out.rom.push({ addr: i, val: dbg.readROM(i) });
        }
        if (typeof dbg.readMemory === 'function' || typeof dbg.readRAM === 'function') {
          const readMem = typeof dbg.readMemory === 'function' ? dbg.readMemory : dbg.readRAM;
          out.ramSample = [];
          for (let a = 0x4000; a < 0x4050; a++) out.ramSample.push({ addr: a, val: readMem(a) });
        }
        out.snapshot = [];
        if (typeof dbg.snapshotGlyph === 'function') {
          for (let c = 0; c < 32; c++) out.snapshot.push({ col: c, s: dbg.snapshotGlyph(c, 184) });
        }
        out.__TEST__ = window.__TEST__ ? {
          hasFrameGenerated: !!window.__TEST__.frameGenerated,
          hasFrameRendered: !!window.__TEST__.frameRendered,
          portReads: window.__TEST__.portReads ? window.__TEST__.portReads.slice(-20) : undefined,
          keyEvents: window.__TEST__.keyEvents ? window.__TEST__.keyEvents.slice(-20) : undefined,
          domLog: window.__TEST__.domLog ? window.__TEST__.domLog.slice(-20) : undefined,
          charsDiag: window.__TEST__.charsDiag || null,
          charsWrites: window.__TEST__.charsWrites ? window.__TEST__.charsWrites.slice(-20) : undefined
        } : null;
        const emu = window.emulator || window.emu;
        out.frameBufferNonZero = false;
        if (emu && emu.ula && emu.ula.frameBuffer && emu.ula.frameBuffer.buffer) {
          const buf = emu.ula.frameBuffer.buffer;
          const topBorderBytes = 24 * 160;
          const lineStride = 16 + 64 + 16;
          for (let r = 184; r < 192; r++) {
            for (let col = 0; col < 32; col++) {
              const bufferPtr = topBorderBytes + r * lineStride + 16 + col * 2;
              if (buf[bufferPtr] !== 0) out.frameBufferNonZero = true;
            }
          }
        }
      } catch (e) { out.error = String(e); }
      return out;
    });
  }

  return { romHasCopyright, fbHasText, glyphCheck, snapshotMatches, pixelCompareResults, diag };
}

export async function collectSystemVars(page) {
  return await page.evaluate(() => {
    if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.peekMemory) {
      return {
        FRAMES: [
          window.__ZX_DEBUG__.peekMemory(0x5C5C, 1)[0],
          window.__ZX_DEBUG__.peekMemory(0x5C5D, 1)[0],
          window.__ZX_DEBUG__.peekMemory(0x5C5E, 1)[0],
          window.__ZX_DEBUG__.peekMemory(0x5C5F, 1)[0]
        ],
        CHARS: window.__ZX_DEBUG__.peekMemory(0x5C36, 2),
        CURCHL: [ window.__ZX_DEBUG__.peekMemory(0x5C51, 1)[0], window.__ZX_DEBUG__.peekMemory(0x5C52, 1)[0] ],
        bottomRam: (function(){ try { const out = []; for (let a = 0x5C00; a < 0x5C40; a++) out.push(window.__ZX_DEBUG__.peekMemory(a,1)[0]); return out; } catch(e) { return null; } })(),
        lastPC: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.getPC) ? window.__ZX_DEBUG__.getPC() : null,
        portLast: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.getLastPortWrite) ? window.__ZX_DEBUG__.getLastPortWrite() : null,
        timing: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.timing) ? window.__ZX_DEBUG__.timing : null,
        fb: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.peekBottomLines) ? window.__ZX_DEBUG__.peekBottomLines() : null,
        testHook: (window.__TEST__ ? window.__TEST__ : null),
        pcHistory: (window.__PC_WATCHER__ && window.__PC_WATCHER__.history ? window.__PC_WATCHER__.history.slice() : [])
      };
    }
    return null;
  });
}