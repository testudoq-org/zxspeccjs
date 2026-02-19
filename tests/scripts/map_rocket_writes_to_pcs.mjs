#!/usr/bin/env node
/*
  map_rocket_writes_to_pcs.mjs

  Run the Jetpac snapshot, press '5', capture writes to 0x4800..0x49FF and
  map each write to the CPU PC + opcode bytes around that PC. Saves output
  to traces/rocket_writes_pc_map.json for inspection.
*/

import fs from 'fs';
import path from 'path';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

const ARCHIVE_Z80_URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
const OUT = path.resolve(process.cwd(), 'traces', 'rocket_writes_pc_map.json');

(async function main() {
  console.log('Mapping rocket-area memWrites -> origin PCs/opcodes');
  const res = await fetch(ARCHIVE_Z80_URL);
  if (!res.ok) throw new Error('Failed to fetch Jetpac .z80');
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) throw new Error('Parsed snapshot missing RAM');

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(parsed.rom || null);

  // Apply RAM pages
  const ram = parsed.snapshot.ram;
  if (ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }

  // Restore registers via helper if available
  if (typeof emu._applySnapshot_registerRestore === 'function') emu._applySnapshot_registerRestore(parsed.snapshot.registers || {});
  else {
    // minimal restore
    emu.cpu = new Z80(emu.memory);
    const regs = parsed.snapshot.registers || {};
    if (typeof regs.PC === 'number') emu.cpu.PC = regs.PC & 0xffff;
  }

  // Monkey-patch mem.write to capture writes with pc/tstate
  emu.memory._memWrites = [];
  const origWrite = emu.memory.write.bind(emu.memory);
  emu.memory.write = function (addr, value) {
    const r = origWrite(addr, value);
    try {
      if (addr >= 0x4000 && addr <= 0x5AFF) {
        emu.memory._memWrites.push({ addr, value, pc: (emu.cpu ? emu.cpu.PC : null), t: (emu.cpu ? emu.cpu.tstates : null) });
      }
    } catch (e) { /* ignore */ }
    return r;
  };

  // Press '5' and run a short window
  try { emu.input.pressKey('5'); } catch (e) { /* ignore */ }
  if (typeof emu._applyInputToULA === 'function') emu._applyInputToULA();

  const FRAMES = 12;
  const tpf = emu.tstatesPerFrame || 69888;
  const events = [];

  for (let f = 0; f < FRAMES; f++) {
    emu.cpu._microTraceEnabled = true; emu.cpu._microLog = [];
    emu.memory._memWrites = [];

    emu.cpu.runFor(tpf);

    const writes = (emu.memory._memWrites || []).filter(w => w.addr >= 0x4800 && w.addr <= 0x49FF);
    for (const w of writes) {
      const pc = (typeof w.pc === 'number') ? (w.pc & 0xffff) : null;
      const opcodeBytes = [];
      if (pc !== null) {
        for (let i = 0; i < 16; i++) opcodeBytes.push(emu.memory.read((pc + i) & 0xffff));
      }
      events.push({ frame: f, t: w.t, addr: w.addr, value: w.value, pc, opcodeBytes, microTail: (emu.cpu._microLog || []).slice(-8) });
    }
  }

  // Summarize per-PC
  const byPC = {};
  for (const e of events) {
    const k = e.pc === null ? 'null' : e.pc.toString(16).padStart(4, '0');
    byPC[k] = byPC[k] || { occurrences: 0, opcodeBytes: e.opcodeBytes || [], examples: [] };
    byPC[k].occurrences += 1;
    if (byPC[k].examples.length < 6) byPC[k].examples.push({ frame: e.frame, addr: e.addr, value: e.value, t: e.t });
  }

  const out = { meta: { capturedFrames: FRAMES, tpf }, events, byPC };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT, ' — rocket writes captured:', events.length, 'unique PCs:', Object.keys(byPC).length);
})();
