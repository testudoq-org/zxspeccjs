#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
// Inspect mapping between memory bitmap addresses (0x4800..0x483F) and frameBuffer bytes
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, __TEST__: {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
import fs from 'fs';
import path from 'path';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const FRAME = Number(process.env.FRAME || process.argv[2] || 13);
const parsedPath = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');
if (!fs.existsSync(parsedPath)) { console.error('parsed snapshot not found:', parsedPath); process.exit(1); }
const parsed = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));

(async function(){
  const canvasStub = { width:320,height:240,style:{},getContext:()=>({ createImageData:()=>({ data:new Uint8ClampedArray(320*240*4) }), putImageData:()=>{}, fillRect:()=>{} }), toDataURL:()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  // normalize parsed.ram similar to other scripts
  let ram = parsed.ram;
  if (!(ram instanceof Uint8Array)) {
    if (Array.isArray(ram)) ram = Uint8Array.from(ram);
    else {
      const len = Math.max(0, ...Object.keys(ram).map(k=>Number(k)).filter(n=>!Number.isNaN(n))) + 1 || 0xC000;
      const tmp = new Uint8Array(len);
      for (let i=0;i<len;i++) tmp[i] = Number(ram[i]||0)&0xff;
      ram = tmp;
    }
  }
  emu.memory.pages[1].set(ram.subarray(0x0000,0x4000));
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

  const topBorderBytes = 24 * 160;
  const lineStride = 16 + 64 + 16; // 96

  console.log('Inspecting mem offsets 0x0800..0x083F (video RAM 0x4800..0x483F)');
  for (let off = 0x0800; off < 0x0840; off++) {
    const memAddr = 0x4000 + off;
    const xByte = off & 0x1f;
    const y0 = (off >> 8) & 0x07;
    const y1 = (off >> 5) & 0x07;
    const y2 = (off >> 11) & 0x03;
    const y = y0 | (y1 << 3) | (y2 << 6);
    const bufferPtr = topBorderBytes + y * lineStride + 16 + xByte * 2;
    const fbByte = fb[bufferPtr];
    const bitmapVal = emu.memory.pages[1][off];
    const attrVal = emu.memory.pages[1][0x1800 + (Math.floor(y/8) * 32) + xByte];
    console.log(off.toString(16).padStart(4,'0'), 'mem', memAddr.toString(16).padStart(4,'0'), 'y', y.toString().padStart(3,' '), 'xByte', xByte.toString().padStart(2,' '), 'bitmapVal', bitmapVal.toString(16).padStart(2,'0'), 'attrVal', attrVal.toString(16).padStart(2,'0'), 'fbByte', fbByte.toString(16).padStart(2,'0'), 'bufferPtr', bufferPtr);
  }
})();
