#!/usr/bin/env node
/* eslint-env node */
/* global fetch, Buffer, process, console */
// Minimal DOM shims for Node execution (used elsewhere in test scripts)
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, __TEST__: {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
import fs from 'fs';
import path from 'path';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const FRAME = Number(process.env.FRAME || process.argv[2] || 13);
const TPF = 69888;
const OUT = path.resolve(process.cwd(), 'traces');

// Use parsed snapshot from previous captures if available
let parsedPath = path.join(OUT, 'parsed_jetpac_snapshot.json');
let parsed = null;
if (fs.existsSync(parsedPath)) parsed = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));

async function main() {
  // If parsed snapshot not available, fetch Archive.org .z80 and parse
  if (!parsed) {
    console.log('No parsed snapshot found; fetching Archive.org .z80');
    const url = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch jetpac .z80');
    const buf = await res.arrayBuffer();
    parsed = Loader.parseZ80(buf).snapshot;
    fs.writeFileSync(parsedPath, JSON.stringify(parsed, null, 2));
  }

  const canvasStub = { width: 320, height: 240, style: {}, getContext: ()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{}, imageSmoothingEnabled:false }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  // normalize parsed.ram to Uint8Array (accepts Uint8Array, Array, or object map)
  let ram = parsed.ram;
  if (!ram) throw new Error('Parsed snapshot RAM missing or truncated');
  if (!(ram instanceof Uint8Array)) {
    if (Array.isArray(ram)) ram = Uint8Array.from(ram);
    else {
      const len = Math.max(0, ...Object.keys(ram).map(k => Number(k)).filter(n => !Number.isNaN(n))) + 1 || 0xC000;
      const tmp = new Uint8Array(len);
      for (let i = 0; i < len; i++) tmp[i] = Number(ram[i] || 0) & 0xff;
      ram = tmp;
    }
  }
  if (ram.length < 0xC000) throw new Error('Parsed snapshot RAM missing or truncated');
  emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();

  emu.cpu = new Z80(emu.memory);
  const regs = parsed.registers || {};
  if (typeof regs.PC === 'number') emu.cpu.PC = regs.PC & 0xffff;
  if (typeof regs.SP === 'number') emu.cpu.SP = regs.SP & 0xffff;
  if (typeof regs.A === 'number') emu.cpu.A = regs.A & 0xff;
  if (typeof regs.R === 'number') emu.cpu.R = regs.R & 0xff;

  // Run frames up to target FRAME (inclusive)
  for (let f = 0; f <= FRAME; f++) {
    emu.cpu.frameStartTstates = emu.cpu.tstates;
    emu.cpu._microTraceEnabled = false;
    emu.memory._memWrites = [];
    emu.memory._contentionLog = [];
    emu._portWrites = [];
    emu.cpu.runFor(TPF);
  }

  // Generate framebuffer from memory and save samples
  if (emu.ula && emu.ula.frameBuffer) {
    emu.ula.frameBuffer.generateFromMemory();
    const fb = emu.ula.frameBuffer.getBuffer();
    fs.writeFileSync(path.join(OUT, `jetpac_framebuffer_frame${FRAME}.bin`), Buffer.from(fb));
    fs.writeFileSync(path.join(OUT, `jetpac_framebuffer_frame${FRAME}.json`), JSON.stringify({ first64: Array.from(fb.slice(0,64)).map(b=>b.toString(16).padStart(2,'0')) }, null, 2));
  }

  // Dump video RAM bytes for rocket area (0x4800..0x483F) and attributes (0x5800..0x583F)
  const page1 = emu.memory.pages[1];
  const rocketBytes = Array.from(page1.subarray(0x0800, 0x0840)); // 0x4800 - 0x483F -> RAM offset 0x0800
  const rocketAttrs = Array.from(page1.subarray(0x1800, 0x1840)); // 0x5800 - 0x583F -> RAM offset 0x1800
  fs.writeFileSync(path.join(OUT, `jetpac_rocket_bytes_frame${FRAME}.json`), JSON.stringify({ rocketBytes, rocketAttrs }, null, 2));

  // Also write recent mem._memWrites for rocket area
  const writes = (emu.memory._memWrites || []).filter(w => w.addr >= 0x4800 && w.addr < 0x4A00);
  fs.writeFileSync(path.join(OUT, `jetpac_rocket_memwrites_frame${FRAME}.json`), JSON.stringify(writes, null, 2));

  console.log('Wrote framebuffer + rocket-region dumps for frame', FRAME);
}

main().catch(e => { console.error(e); process.exit(1); });
