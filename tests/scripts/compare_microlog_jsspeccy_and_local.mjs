#!/usr/bin/env node
/*
  compare_microlog_jsspeccy_and_local.mjs

  Capture CPU microLogs from the reference JSSpeccy site and the local
  zxspeccjs emulator (Jetpac .z80 snapshot), find the first differing
  microLog entry, and write a JSON report to ./traces/microlog_compare.json

  Usage:
    node tests/scripts/compare_microlog_jsspeccy_and_local.mjs [--url <JSSPECCY_URL>]

  This is a diagnostic helper (not a unit test).
*/

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const DEFAULT_REF = process.env.REFERENCE_URL || 'https://jsspeccy.zxdemo.org/';
const ARCHIVE_Z80_URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const outPath = path.resolve(process.cwd(), 'traces', 'microlog_compare.json');

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const refUrl = urlIdx !== -1 && args[urlIdx + 1] ? args[urlIdx + 1] : DEFAULT_REF;

async function captureRefMicro({ url, headed = false, waitMs = 600 } = {}) {
  const browser = await chromium.launch({ headless: !headed, args: ['--no-sandbox'] });
  const page = await browser.newPage({ timeout: 30000 });
  await page.goto(url, { waitUntil: 'load', timeout: 20000 }).catch(() => {});

  // Try to find Jetpac and press '5' (best-effort, tolerant of UI variants)
  try {
    await page.waitForTimeout(1200);
    const searchInput = page.locator('input[type=search], input[placeholder*=Search]').first();
    if (await searchInput.count()) {
      await searchInput.fill('Jetpac');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    } else {
      await page.keyboard.type('Jetpac');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }

    const exact = page.locator('text=Jetpac [a][16K]').first();
    if (await exact.count()) await exact.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200).catch(() => {});

    const canvas = page.locator('canvas, #screen').first();
    await canvas.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

    // Enable micro-trace on the reference emulator (if present)
    await page.evaluate(() => {
      try { if (window.emu && window.emu.cpu) { window.emu.cpu._microTraceEnabled = true; window.emu.cpu._microLog = []; } } catch (e) {}
    }).catch(() => {});

    // Press START key '5'
    await canvas.click({ force: true }).catch(() => {});
    await canvas.press('5').catch(() => page.keyboard.press('5'));
    await page.waitForTimeout(waitMs).catch(() => {});
  } catch (e) {
    // non-fatal
  }

  // Extract microLog and a short timeline
  const diag = await page.evaluate(() => {
    const out = { found: !!(window.emu && window.emu.cpu) };
    try { out.cpu = window.emu && window.emu.cpu ? { PC: window.emu.cpu.PC, R: window.emu.cpu.R, tstates: window.emu.cpu.tstates } : null; } catch (e) { out.cpu = null; }
    try { out.micro = (window.emu && window.emu.cpu && Array.isArray(window.emu.cpu._microLog)) ? window.emu.cpu._microLog.slice() : null; } catch (e) { out.micro = null; }
    try { out.memWrites = (window.emu && window.emu.memory && Array.isArray(window.emu.memory._memWrites)) ? window.emu.memory._memWrites.slice(-256) : []; } catch (e) { out.memWrites = null; }
    return out;
  }).catch(err => ({ error: String(err) }));

  await browser.close();
  return { url, diag };
}

async function captureLocalMicro({ frames = 12, waitMs = 0 } = {}) {
  const res = await fetch(ARCHIVE_Z80_URL);
  if (!res.ok) throw new Error('Failed to fetch Jetpac .z80 from archive.org');
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) throw new Error('Parsed snapshot missing RAM');

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  const ram = parsed.snapshot.ram;
  if (ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }
  emu._applySnapshot_registerRestore(parsed.snapshot.registers || {});

  // Instrument CPU microLog
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);
  emu.cpu._microTraceEnabled = true; emu.cpu._microLog = [];

  // Ensure ULA/input mapping
  if (emu.ula && typeof emu._applyInputToULA === 'function') emu._applyInputToULA();

  // Press '5' then run several frames
  try { emu.input.pressKey('5'); } catch (e) {}
  if (typeof emu._applyInputToULA === 'function') emu._applyInputToULA();

  const tpf = emu.tstatesPerFrame || 69888;
  for (let f = 0; f < frames; f++) {
    emu.cpu.runFor(tpf);
    if (waitMs) await new Promise(r => setTimeout(r, waitMs));
  }

  const out = { cpu: { PC: emu.cpu.PC, R: emu.cpu.R, tstates: emu.cpu.tstates }, micro: Array.isArray(emu.cpu._microLog) ? emu.cpu._microLog.slice() : [] };
  return out;
}

function normalizeEvent(e) {
  if (!e || typeof e !== 'object') return e;
  const copy = { ...e };
  // Remove timing (t) which can legitimately differ; keep structural fields
  delete copy.t;
  // canonicalize numeric props to plain numbers
  if (typeof copy.pc === 'number') copy.pc = copy.pc & 0xffff;
  if (typeof copy.target === 'number') copy.target = copy.target & 0xffff;
  if (typeof copy.addr === 'number') copy.addr = copy.addr & 0xffff;
  if (Array.isArray(copy.bytes)) copy.bytes = copy.bytes.slice(0, 8); // limit size
  return copy;
}

function firstMismatchIndex(a, b) {
  const la = Array.isArray(a) ? a : [];
  const lb = Array.isArray(b) ? b : [];
  const L = Math.max(la.length, lb.length);
  for (let i = 0; i < L; i++) {
    const ea = la[i] ? JSON.stringify(normalizeEvent(la[i])) : null;
    const eb = lb[i] ? JSON.stringify(normalizeEvent(lb[i])) : null;
    if (ea !== eb) return { idx: i, ours: la[i] || null, ref: lb[i] || null };
  }
  return { idx: -1, ours: null, ref: null };
}

(async function main() {
  console.log('Running microLog comparison — reference vs local (Jetpac START window)');
  const ref = await captureRefMicro({ url: refUrl }).catch(err => ({ error: String(err) }));
  const local = await captureLocalMicro({ frames: 12 }).catch(err => ({ error: String(err) }));

  const refMicro = ref?.diag?.micro || null;
  const localMicro = local?.micro || null;

  const mismatch = firstMismatchIndex(localMicro, refMicro);
  const report = { timestamp: Date.now(), refUrl, refPresent: !!ref?.diag?.micro, refMicroLen: Array.isArray(refMicro) ? refMicro.length : 0, localMicroLen: Array.isArray(localMicro) ? localMicro.length : 0, mismatchIndex: mismatch.idx, mismatchSample: { ours: normalizeEvent(mismatch.ours), ref: normalizeEvent(mismatch.ref) }, refSummary: ref?.diag?.cpu || null, localSummary: local?.cpu || null };

  try { fs.writeFileSync(outPath, JSON.stringify(report, null, 2)); console.log('Wrote microLog compare report ->', outPath); } catch (e) { console.error('Failed to write report', e); }

  if (mismatch.idx === -1) {
    console.log('No difference detected in captured microLog window. (lengths: ref=', report.refMicroLen, ', local=', report.localMicroLen, ')');
    process.exitCode = 0;
  } else {
    console.log(`First mismatch at microLog index ${mismatch.idx}`);
    console.log(' - local event:', JSON.stringify(normalizeEvent(mismatch.ours), null, 2));
    console.log(' - ref   event:', JSON.stringify(normalizeEvent(mismatch.ref), null, 2));
    process.exitCode = 2;
  }
})();
