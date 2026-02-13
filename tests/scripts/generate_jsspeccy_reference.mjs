#!/usr/bin/env node
// Generate a reference trace using jsspeccy3 by downloading a release, patching
// the worker to emit mem/port/reg events, and running it headless via Playwright.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const OUT = path.resolve(process.cwd(), 'tests', 'reference', 'jsspeccy');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  console.log('[generate_jsspeccy_reference] Starting');
  // Use a tagged release zip URL for jsspeccy3 v3.2
  const tag = 'v3.2';
  const zipUrl = `https://github.com/gasman/jsspeccy3/archive/refs/tags/${tag}.zip`;
  const zipFile = path.join(OUT, `${tag}.zip`);
  console.log('[generate_jsspeccy_reference] Downloading', zipUrl);

  // Use PowerShell Invoke-WebRequest for reliability on Windows environment
  const dl = spawnSync('powershell', ['-NoProfile', '-Command', `Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${zipFile}'`], { stdio: 'inherit' });
  if (dl.status !== 0) throw new Error('Download failed');

  console.log('[generate_jsspeccy_reference] Extracting zip');
  const dest = path.join(OUT, 'extracted');
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const ex = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${zipFile}' -DestinationPath '${dest}'`], { stdio: 'inherit' });
  if (ex.status !== 0) throw new Error('Extract failed');

  // Copy needed files (runtime/jsspeccy.js, runtime/worker.js and wasm file)
  const base = path.join(dest, `jsspeccy3-${tag.replace(/^v/,'')}`);
  const runtime = path.join(base, 'runtime');
  const srcFiles = ['jsspeccy.js', 'worker.js'];
  for (const f of srcFiles) {
    const src = path.join(runtime, f);
    const dst = path.join(OUT, f);
    if (!fs.existsSync(src)) throw new Error(`Expected ${src} to exist`);
    fs.copyFileSync(src, dst);
    console.log('[generate_jsspeccy_reference] Copied', f);
  }

  // copy wasm and other assets from top-level jsspeccy folder if present
  const jsspeccyFolder = path.join(base, 'jsspeccy');
  if (fs.existsSync(jsspeccyFolder)) {
    const wasmSrc = path.join(jsspeccyFolder, 'jsspeccy-core.wasm');
    if (fs.existsSync(wasmSrc)) fs.copyFileSync(wasmSrc, path.join(OUT, 'jsspeccy-core.wasm'));
    // copy static assets
    const others = ['jsspeccy-core.wasm'];
    console.log('[generate_jsspeccy_reference] Copied runtime distribution assets');
  } else {
    console.warn('[generate_jsspeccy_reference] Warning: jsspeccy folder not found in release - checks later');
  }

  // Patch worker.js to emit mem/port/reg events
  const workerPath = path.join(OUT, 'worker.js');
  let workerSrc = fs.readFileSync(workerPath, 'utf-8');

  // Insert patch after `core = results.instance.exports;`
  const needle = "core =\nresults.instance.exports;";
  if (workerSrc.indexOf(needle) === -1) {
    throw new Error('Unexpected worker.js layout: cannot find core instantiation point');
  }

  const patch = `core =\nresults.instance.exports;
    // Instrumentation: wrap poke and writePort to emit events for tracing
    try {
      const _origPoke = core.poke;
      if (typeof _origPoke === 'function') {
        core.poke = function(addr, val) {
          try { postMessage({ message: 'memWrite', addr, value: val, t: (core.getTStates ? core.getTStates() : 0) }); } catch(e){}
          return _origPoke(addr, val);
        };
      }
      const _origWritePort = core.writePort;
      if (typeof _origWritePort === 'function') {
        core.writePort = function(port, val) {
          try { postMessage({ message: 'portWrite', port, value: val, t: (core.getTStates ? core.getTStates() : 0) }); } catch(e){}
          return _origWritePort(port, val);
        };
      }
      // Provide a helper to snapshot registers
      const _origRunFrame = core.runFrame;
      core._snapshotRegisters = function() {
        try {
          const regs = new Uint16Array(core.memory.buffer, core.REGISTERS, 12);
          const out = Array.from(regs);
          postMessage({ message: 'regsSnapshot', regs: out, t: (core.getTStates ? core.getTStates() : 0) });
        } catch (e) {}
      };
    } catch (e) { }
  `;

  workerSrc = workerSrc.replace(needle, patch);
  fs.writeFileSync(workerPath, workerSrc, 'utf-8');
  console.log('[generate_jsspeccy_reference] Patched worker.js with instrumentation');

  // Create an instrumented HTML page that loads the local jsspeccy and collects events
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>JSSpeccy Instrumented</title></head><body>
<div id="jsspeccy"></div>
<script src="./jsspeccy.js"></script>
<script>
  window.__REF_EVENTS__ = [];
  function installHooks(emu) {
    // Hook worker messages forwarded by emulator if exposed
    try {
      const w = emu._worker;
      if (w) {
        w.addEventListener('message', (e) => {
          const d = e.data;
          if (d && (d.message === 'memWrite' || d.message === 'portWrite' || d.message === 'regsSnapshot')) {
            window.__REF_EVENTS__.push(d);
          }
        });
      }
    } catch (e) { console.error('hook failed', e); }
  }
  window.__CREATE_EMU__ = async function() {
    const emu = JSSpeccy(document.getElementById('jsspeccy'), { autoStart: false, sandbox: true });
    return new Promise((resolve) => emu.onReady(() => { installHooks(emu); resolve(emu); }));
  };
</script>
</body></html>`;

  fs.writeFileSync(path.join(OUT, 'instrumented.html'), html, 'utf-8');
  console.log('[generate_jsspeccy_reference] Wrote instrumented HTML');

  // Create Playwright runner to open the page, load snapshot (passed as bytes), run frames, and save logs
  const runner = `#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const out = path.resolve(process.cwd(), 'traces');
if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

async function main() {
  const pageFile = path.resolve(__dirname, '..', 'reference', 'jsspeccy', 'instrumented.html');
  const pageUrl = 'file://' + pageFile.replace(/\\/g, '/');
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(pageUrl);
  const emu = await page.evaluate(async () => { return (await window.__CREATE_EMU__()) ? true : true; });

  // Prepare a minimal snapshot compatible with jsspeccy loadSnapshotFromStruct
  // We'll re-use a simple structure with memoryPages and registers
  const snapshot = (function(){
    // Minimal snapshot - filled by host later if needed
    return { model: 48, memoryPages: {}, registers: { PC: 0x8000, SP: 0xFF00, A:0xAA, B:0, C:0, D:0, E:0, H:0x40, L:0x10, IX:0, IY:0, I:63, R:1, iff1: true, iff2: true, im: 1 }, ulaState: { borderColour:0 }, tstates: 0 };
  })();

  // Inject the snapshot data generated in node (we will generate a matching snapshot blob in the node script)
  // For now, attempt to call emu.loadSnapshotFromStruct via page.evaluate
  await page.evaluate((snap) => {
    try { window.__EMU__ = JSSpeccy(document.getElementById('jsspeccy'), { autoStart: false, sandbox: true });
      window.__EMU__.onReady(() => { try { window.__EMU__.loadSnapshotFromStruct(snap); } catch (e) { console.error('load snapshot failed', e); } });
    } catch (e) { console.error(e); }
  }, snapshot);

  // Allow some time for frame execution and collect events
  const FRAMES = 200;
  // run frames by calling the underlying worker directly through the emulator (if exposed)
  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate(() => {
      try {
        const emu = window.__EMU__;
        if (emu && emu._worker) {
          emu._worker.postMessage({ message: 'runFrame' });
        }
      } catch (e) {}
    });
    // small delay to give worker time to complete and post messages
    await page.waitForTimeout(50);
  }

  // Retrieve events
  const events = await page.evaluate(() => window.__REF_EVENTS__);
  await browser.close();

  const outFile = path.join(out, 'jsspeccy_reference_jetpac_trace.json');
  fs.writeFileSync(outFile, JSON.stringify({ meta: { frames: FRAMES }, events }, null, 2));
  console.log('Wrote reference trace to', outFile);
}

main().catch(e => { console.error('Reference capture failed', e); process.exit(1); });
`;

  fs.writeFileSync(path.join(OUT, 'run_reference_capture.mjs'), runner, 'utf-8');
  fs.chmodSync(path.join(OUT, 'run_reference_capture.mjs'), 0o755);
  console.log('[generate_jsspeccy_reference] Wrote Playwright runner');

  console.log('[generate_jsspeccy_reference] Done. Next: run tests/reference/jsspeccy/run_reference_capture.mjs to produce the reference trace.');
}

main().catch(e => { console.error('generate failed', e); process.exit(1); });
