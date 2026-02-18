#!/usr/bin/env node
/*
  compare_jsspeccy_and_local.mjs

  - Launches a reference JSSpeccy instance (default: https://jsspeccy.zxdemo.org/)
  - Captures mem4800 + recent memWrites + PC/R timeline after pressing '5'
  - Runs the local zxspeccjs Emulator (same Jetpac .z80) in-Node, simulates pressing '5'
  - Compares the two traces and writes a JSON report to ./traces/compare_jsspeccy_vs_local.json

  Usage:
    node tests/scripts/compare_jsspeccy_and_local.mjs [--headed] [--url <JSSPECCY_URL>]

  Notes:
    - This is a diagnostic helper (not a unit test). Run locally when you need a direct
      parity comparison between the reference and our emulator.
*/

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const DEFAULT_REF = process.env.REFERENCE_URL || 'https://jsspeccy.zxdemo.org/';
const ARCHIVE_Z80_URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const urlIdx = args.indexOf('--url');
const refUrl = urlIdx !== -1 && args[urlIdx + 1] ? args[urlIdx + 1] : DEFAULT_REF;

const outPath = path.resolve(process.cwd(), 'traces', 'compare_jsspeccy_vs_local.json');

async function captureJSSpeccy({ headed, url }) {
  const browser = await chromium.launch({ headless: !headed, args: ['--no-sandbox'] });
  const page = await browser.newPage({ timeout: 30000 });
  await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});

  // Attempt to find Jetpac entry and send START (best-effort; tolerant of UI variants)
  try {
    // reuse logic similar to jsspeccy-jetpac-automation.mjs but compact
    await page.waitForTimeout(1200);
    // try search box
    const searchInput = page.locator('input[type=search], input[placeholder*=Search]').first();
    if (await searchInput.count()) {
      await searchInput.fill('Jetpac');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    } else {
      // fallback: type into page
      await page.keyboard.type('Jetpac');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }

    // click result if present
    const exact = page.locator('text=Jetpac [a][16K]').first();
    if (await exact.count()) await exact.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);

    // find canvas and press '5'
    const canvas = page.locator('canvas, #screen').first();
    await canvas.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await canvas.click({ force: true }).catch(() => {});
    await canvas.press('5').catch(() => page.keyboard.press('5'));
    await page.waitForTimeout(600);
  } catch (e) {
    // non-fatal — we'll still try to extract diagnostics
  }

  // Read diagnostics from page
  const diag = await page.evaluate(() => {
    const maybe = window.emu || window.Speccy || window.jsSpeccy || window.JSSpeccy || window.SpeccyJS;
    const out = { found: !!maybe };
    try { out.pc = maybe && maybe.cpu ? maybe.cpu.PC : null; } catch (e) { out.pc = null; }
    try { out.mem4800 = maybe && maybe.memory && maybe.memory.pages ? Array.from(maybe.memory.pages[1].slice(0x4800 - 0x4000, 0x4800 - 0x4000 + 64)) : null; } catch (e) { out.mem4800 = null; }
    try { out.memWrites = (maybe && maybe.memory && Array.isArray(maybe.memory._memWrites)) ? maybe.memory._memWrites.slice(-256) : (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.memWrites) ? window.__ZX_DEBUG__.memWrites.slice(-256) : []); } catch (e) { out.memWrites = null; }
    try { out.portWrites = (maybe && Array.isArray(maybe._portWrites)) ? maybe._portWrites.slice(-256) : (window.__ZX_DEBUG__ && Array.isArray(window.__ZX_DEBUG__.portWrites) ? window.__ZX_DEBUG__.portWrites.slice(-256) : []); } catch (e) { out.portWrites = null; }
    try { out.soundToggles = (maybe && maybe.sound && Array.isArray(maybe.sound._toggles)) ? maybe.sound._toggles.slice(-128) : null; } catch (e) { out.soundToggles = null; }
    return out;
  }).catch(err => ({ error: String(err) }));

  await browser.close();
  return { url, headed, diag };
}

async function runLocalZX({ headless = true } = {}) {
  // Download Jetpac .z80 from Archive.org and parse
  const res = await fetch(ARCHIVE_Z80_URL);
  if (!res.ok) throw new Error('Failed to fetch Jetpac .z80 from archive.org');
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) throw new Error('Parsed snapshot missing RAM');

  // Create emulator with canvas stub
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  // Apply RAM + registers
  const ram = parsed.snapshot.ram;
  if (ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }
  emu._applySnapshot_registerRestore(parsed.snapshot.registers || {});

  // Ensure frameBuffer updated
  if (emu.ula && emu.ula.frameBuffer && typeof emu.ula.frameBuffer.generateFromMemory === 'function') emu.ula.frameBuffer.generateFromMemory();

  // Instrument memory writes collection
  emu.memory._memWrites = [];
  const origWrite = emu.memory.write.bind(emu.memory);
  emu.memory.write = function (addr, value) {
    const r = origWrite(addr, value);
    try { if (addr >= 0x4000 && addr <= 0x5AFF) emu.memory._memWrites.push({ addr, value, pc: emu.cpu ? emu.cpu.PC : null, t: emu.cpu ? emu.cpu.tstates : null }); } catch (e) { /* ignore */ }
    return r;
  };

  emu._portWrites = [];
  if (emu.ula && typeof emu.ula.writePort === 'function') {
    const origUlaOut = emu.ula.writePort.bind(emu.ula);
    emu.ula.writePort = function (port, value) {
      emu._portWrites.push({ port, value, pc: emu.cpu ? emu.cpu.PC : null, t: emu.cpu ? emu.cpu.tstates : null });
      return origUlaOut(port, value);
    };
  }

  // Simulate pressing '5'
  try { emu.input.pressKey('5'); } catch (e) { /* ignore */ }

  // Run a few frames (short window) and collect memWrites
  const FRAMES = 12;
  const tpf = emu.tstatesPerFrame || 69888;
  for (let f = 0; f < FRAMES; f++) {
    emu.cpu.runFor(tpf);
    // small pause for completeness
  }

  const pc = emu.cpu ? emu.cpu.PC : null;
  const mem4800 = emu.memory.pages[1] ? Array.from(emu.memory.pages[1].slice(0x4800 - 0x4000, 0x4800 - 0x4000 + 64)) : null;
  const memWrites = (emu.memory._memWrites || []).slice(-256);
  const portWrites = (emu._portWrites || []).slice(-256);

  return { pc, mem4800, memWrites, portWrites };
}

function diffArrays(a, b) {
  if (!a || !b) return { equal: false, reason: 'missing' };
  if (a.length !== b.length) return { equal: false, reason: 'length' };
  const diffs = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push({ idx: i, ours: a[i], ref: b[i] });
  return { equal: diffs.length === 0, diffs };
}

(async function main() {
  console.log('Compare JSSpeccy (reference) vs local zxspeccjs — Jetpac START');
  const ref = await captureJSSpeccy({ headed, url: refUrl }).catch(err => ({ error: String(err) }));
  const local = await runLocalZX().catch(err => ({ error: String(err) }));

  const report = { timestamp: Date.now(), refUrl, headed, ref, local };

  try { fs.writeFileSync(outPath, JSON.stringify(report, null, 2)); console.log('Wrote report ->', outPath); } catch (e) { console.error('Failed to write report', e); }

  // Summarize differences
  const mem4800diff = diffArrays((ref?.diag?.mem4800 || null), (local?.mem4800 || null));
  const pcdiff = { refPC: ref?.diag?.pc || null, localPC: local?.pc || null, equal: (ref?.diag?.pc || null) === (local?.pc || null) };

  console.log('\nSummary:');
  console.log(' - mem4800 equal:', mem4800diff.equal, mem4800diff.diffs && mem4800diff.diffs.length ? `(${mem4800diff.diffs.length} diffs)` : '');
  console.log(' - PC equal:', pcdiff.equal, `(ref=${pcdiff.refPC}, local=${pcdiff.localPC})`);
  console.log(' - reference memWrites tail count:', (ref?.diag?.memWrites || []).length);
  console.log(' - local memWrites tail count:', (local?.memWrites || []).length);

  if (!mem4800diff.equal || !pcdiff.equal) {
    console.log('\nDetailed report saved to', outPath);
    process.exitCode = 2;
  } else {
    console.log('\nNo obvious snapshot/memory differences detected for the checked window.');
  }
})();
