#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, __TEST__: {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';
import fs from 'fs';
const parsed = JSON.parse(fs.readFileSync('traces/parsed_jetpac_snapshot.json','utf8'));
const FRAME = parseInt(process.env.FRAME || '13', 10);
(async()=>{
  const canvasStub = { width:320,height:240,style:{},getContext:()=>({ createImageData:()=>({ data:new Uint8ClampedArray(320*240*4) }), putImageData:()=>{}, fillRect:()=>{} }), toDataURL:()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);
  // normalize parsed.ram to a Uint8Array (accepts Uint8Array, Array, or object map)
  let ram = parsed.ram;
  if (!ram) throw new Error('Parsed snapshot RAM missing');
  if (!(ram instanceof Uint8Array)) {
    if (Array.isArray(ram)) {
      ram = Uint8Array.from(ram);
    } else {
      // object map produced by JSON.stringify on a Uint8Array
      const len = Math.max(0, ...Object.keys(ram).map(k => Number(k)).filter(n => !Number.isNaN(n))) + 1 || 0xC000;
      const tmp = new Uint8Array(len);
      for (let i = 0; i < len; i++) tmp[i] = Number(ram[i] || 0) & 0xff;
      ram = tmp;
    }
  }
  emu.memory.pages[1].set(ram.subarray(0,0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000,0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000,0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();
  emu.cpu = new Z80(emu.memory);
  const regs = parsed.registers || {};
  if (typeof regs.PC === 'number') emu.cpu.PC = regs.PC & 0xffff;
  if (typeof regs.SP === 'number') emu.cpu.SP = regs.SP & 0xffff;
  if (typeof regs.R === 'number') emu.cpu.R = regs.R & 0xff;
  const TPF = 69888;
  for (let f=0; f<=FRAME; f++) {
    emu.cpu.frameStartTstates = emu.cpu.tstates;
    emu.memory._memWrites = [];
    emu._portWrites = [];
    emu.cpu.runFor(TPF);
  }
  emu.ula.frameBuffer.generateFromMemory();
  const fb = emu.ula.frameBuffer.getBuffer();
  const fbFirst64 = Array.from(fb.slice(0,64)).map(b=>b.toString(16).padStart(2,'0'));
  const page1 = emu.memory.pages[1];
  const rocketBytes = Array.from(page1.subarray(0x0800, 0x0840));
  const rocketAttrs = Array.from(page1.subarray(0x1800, 0x1840));
  const rocketMemWrites = (emu.memory._memWrites||[]).filter(w=>w.addr>=0x4800 && w.addr<0x4A00).slice(0,200);
  const out = { frame: FRAME, fbFirst64, rocketBytes, rocketAttrs, rocketMemWrites };
  const outPath = `traces/inspect_frame${FRAME}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote inspection report to', outPath);
})();
