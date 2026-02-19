#!/usr/bin/env node
import fs from 'fs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

(async function main() {
  const parsed = JSON.parse(fs.readFileSync('traces/parsed_jetpac_snapshot.json', 'utf8'));
  const ramObj = parsed.ram || {};
  const RAM_48K = 49152;
  const ramBuf = new Uint8Array(RAM_48K);
  for (const k of Object.keys(ramObj)) { const idx = Number(k); if (!Number.isNaN(idx) && idx >= 0 && idx < RAM_48K) ramBuf[idx] = ramObj[k] & 0xff; }

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {} }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);
  if (emu.memory.pages[1]) emu.memory.pages[1].set(ramBuf.subarray(0, 0x4000));
  if (emu.memory.pages[2]) emu.memory.pages[2].set(ramBuf.subarray(0x4000, 0x8000));
  if (emu.memory.pages[3]) emu.memory.pages[3].set(ramBuf.subarray(0x8000, 0xC000));
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);

  // Start from snapshot PC if present
  const startPC = (parsed.registers && typeof parsed.registers.PC === 'number') ? parsed.registers.PC & 0xffff : (emu.cpu.PC & 0xffff);
  emu.cpu.PC = startPC;
  emu.cpu._microTraceEnabled = false; // use debugCallback instead of microLog here

  const dbAddrs = [8716,10689,13129,13149,13185,13216,13371];
  const executed = [];
  emu.cpu.debugCallback = (opcode, pc) => { executed.push({ opcode, pc }); };

  // Press '5' before tracing
  try { emu.input.pressKey('5'); } catch (e) {}
  if (typeof emu._applyInputToULA === 'function') emu._applyInputToULA();

  const tpf = emu.tstatesPerFrame || 69888;
  const FRAMES = 6; // small window
  for (let f = 0; f < FRAMES; f++) emu.cpu.runFor(tpf);

  const pcs = executed.map(e => e.pc);
  const hits = dbAddrs.filter(a => pcs.includes(a));
  const freq = {};
  pcs.forEach(p => freq[p] = (freq[p] || 0) + 1);
  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,60);

  const out = { startPC, frames: FRAMES, executedCount: executed.length, dbAddrs, dbHits: hits, topPCs: top.slice(0,40) };
  fs.writeFileSync('traces/pc_exec_stream.json', JSON.stringify(out, null, 2));
  console.log('Wrote traces/pc_exec_stream.json — dbFE hits:', hits, 'executed instructions:', executed.length);
})();
