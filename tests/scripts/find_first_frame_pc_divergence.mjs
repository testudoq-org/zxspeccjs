#!/usr/bin/env node
/*
  find_first_frame_pc_divergence.mjs

  Compare per-frame PC from the saved jsspeccy reference trace against a
  local zxspeccjs emulator run (Jetpac snapshot). Report the first frame
  where PC differs and save a small JSON report to traces/frame_pc_diff.json
*/

import fs from 'fs';
import path from 'path';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const REF_TRACE = path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.json');
const ARCHIVE_Z80_URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const OUT = path.resolve(process.cwd(), 'traces', 'frame_pc_diff.json');

(async function main() {
  if (!fs.existsSync(REF_TRACE)) { console.error('Reference trace not found:', REF_TRACE); process.exit(2); }
  const ref = JSON.parse(fs.readFileSync(REF_TRACE, 'utf8'));
  const refFrames = (ref.frames || []).map(f => ({ frame: f.frame, pc: f.regs ? f.regs.PC : null }));

  // Run local emulator and capture per-frame PC for same frame count
  const framesToCheck = Math.min(50, refFrames.length);

  const res = await fetch(ARCHIVE_Z80_URL);
  if (!res.ok) throw new Error('Failed to fetch Jetpac .z80 from archive.org');
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);

  const canvasStub = { width:320, height:240, style:{}, getContext:()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{} }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  const ram = parsed.snapshot.ram;
  if (ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }
  emu._applySnapshot_registerRestore(parsed.snapshot.registers || {});
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);

  const tpf = emu.tstatesPerFrame || 69888;
  const local = [];
  for (let f = 0; f < framesToCheck; f++) {
    emu.cpu.runFor(tpf);
    local.push({ frame: f, pc: emu.cpu.PC, tstates: emu.cpu.tstates });
  }

  // Find first differing frame
  let firstDiff = -1;
  for (let i = 0; i < framesToCheck; i++) {
    const r = refFrames[i] ? refFrames[i].pc : null;
    const l = local[i] ? local[i].pc : null;
    if (r !== l) { firstDiff = i; break; }
  }

  const report = { checkedFrames: framesToCheck, firstDiff, refSample: refFrames.slice(0, framesToCheck), localSample: local };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  if (firstDiff === -1) console.log('No per-frame PC divergence detected for', framesToCheck, 'frames'); else console.log('First per-frame PC divergence at frame', firstDiff, 'refPC=', refFrames[firstDiff].pc, 'localPC=', local[firstDiff].pc);
})();
