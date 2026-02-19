#!/usr/bin/env node
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';
import fs from 'fs';

(async function main() {
  const parsed = JSON.parse(fs.readFileSync('traces/parsed_jetpac_snapshot.json', 'utf8'));
  const ramObj = parsed.ram || {};
  const RAM_48K = 49152;
  const ramBuf = new Uint8Array(RAM_48K);
  for (const k of Object.keys(ramObj)) {
    const idx = Number(k);
    if (!Number.isNaN(idx) && idx >= 0 && idx < RAM_48K) ramBuf[idx] = ramObj[k] & 0xff;
  }

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {} }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);
  if (emu.memory.pages[1]) emu.memory.pages[1].set(ramBuf.subarray(0, 0x4000));
  if (emu.memory.pages[2]) emu.memory.pages[2].set(ramBuf.subarray(0x4000, 0x8000));
  if (emu.memory.pages[3]) emu.memory.pages[3].set(ramBuf.subarray(0x8000, 0xC000));
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);

  const dbAddrs = [8716, 10689, 13129, 13149, 13185, 13216, 13371];
  for (const a of dbAddrs) {
    emu.cpu.PC = a;
    emu.cpu._microTraceEnabled = true;
    emu.cpu._microLog = [];
    try {
      const cycles = emu.cpu.step();
      console.log(`PC 0x${a.toString(16)} -> executed cycles=${cycles}, A=0x${emu.cpu.A.toString(16)}`);
    } catch (e) {
      console.log(`PC 0x${a.toString(16)} -> step failed:`, e.message);
    }
    console.log('microLog tail:', JSON.stringify(emu.cpu._microLog.slice(-6), null, 2));
  }
})();
