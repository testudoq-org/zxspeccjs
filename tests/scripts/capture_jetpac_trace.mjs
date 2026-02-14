#!/usr/bin/env node
// Capture per-frame traces for Jetpac .z80 snapshot
import fs from 'fs';
import path from 'path';

// Ensure DOM globals exist for importing modules that expect browser
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, emulator: null, emu: null };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

import { Loader } from '../../src/loader.mjs';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';


// Generate minimal Jetpac Z80 payload (copied from tests/e2e)
function generateJetpacZ80Payload() {
  const PAGE_SIZE = 16384;
  const header = new Uint8Array(30);
  header[0] = 0xFF; // A
  header[1] = 0x44; // F
  header[6] = 0x00; header[7] = 0x80; // PC = 0x8000
  header[8] = 0x00; header[9] = 0xFF; // SP = 0xFF00
  header[10] = 0x3F; // I
  header[11] = 0x01; // R (low)
  header[12] = 0x00; // flags / border
  header[27] = 1; header[28] = 1; header[29] = 1; // IFF1, IFF2, IM

  const ram = new Uint8Array(3 * PAGE_SIZE);
  for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
  for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
  // Put a small running loop at 0x8000 (RAM offset 0x4000) that writes to
  // video RAM and toggles the speaker port (0xFE), so we capture mem & port writes
  // Loop at 0x8000:
  //   LD HL,0x4000      21 00 40
  //   LD A,0xAA         3E AA
  //   LD B,0x10         06 10
  // loop:
  //   LD (HL),A         77
  //   INC HL            23
  //   OUT (0xFE),A      D3 FE
  //   DJNZ loop         10 FB  ; relative -5 to go back to LD (HL),A
  //   JP 0x8003         C3 03 80 ; reload A/B and continue
  const code = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x10, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];
  // Place the active loop at 0x8000 so PC=0x8000 executes it
  for (let i = 0; i < code.length; i++) ram[0x8000 + i] = code[i];

  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out.buffer;
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'traces');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Parse the snapshot using Loader
  const payloadBuf = generateJetpacZ80Payload();
  const parsed = Loader.parseZ80(payloadBuf);

  // Create an emulator instance with minimal options
  const { Emulator } = await import('../../src/main.mjs');
  // Provide a minimal canvas stub with getContext and imageData helpers
  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      fillRect: () => {},
      drawImage: () => {},
      fillText: () => {},
      clearRect: () => {}
    }),
    toDataURL: () => '',
  };

  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });

  // Apply snapshot manually (avoid UI/DOM side-effects)
  try {
    // Ensure core exists
    if (!emu.memory) await emu._createCore(parsed.rom || null);

    // Load RAM
    const ram = parsed.snapshot && parsed.snapshot.ram;
    if (ram && ram.length > 0) {
      if (ram.length >= 0xC000) {
        if (emu.memory.pages[1]) emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
        if (emu.memory.pages[2]) emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
        if (emu.memory.pages[3]) emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
      } else {
        let off = 0;
        for (let p = 1; p <= 3 && off < ram.length; p++) {
          const len = Math.min(0x4000, ram.length - off);
          if (emu.memory.pages[p]) emu.memory.pages[p].set(ram.subarray(off, off + len));
          off += len;
        }
      }
    }

    // Create CPU if missing
    if (!emu.cpu) emu.cpu = new Z80(emu.memory);
    emu.cpu.attachMemory = emu.memory; // (noop, exists for clarity)

    // Set registers
    const regs = parsed.snapshot.registers || {};
    const cpu = emu.cpu;
    if (typeof regs.PC === 'number') cpu.PC = regs.PC & 0xffff;
    if (typeof regs.SP === 'number') cpu.SP = regs.SP & 0xffff;
    if (typeof regs.A === 'number') cpu.A = regs.A & 0xff;
    if (typeof regs.F === 'number') cpu.F = regs.F & 0xff;
    if (typeof regs.B === 'number') cpu.B = regs.B & 0xff;
    if (typeof regs.C === 'number') cpu.C = regs.C & 0xff;
    if (typeof regs.D === 'number') cpu.D = regs.D & 0xff;
    if (typeof regs.E === 'number') cpu.E = regs.E & 0xff;
    if (typeof regs.H === 'number') cpu.H = regs.H & 0xff;
    if (typeof regs.L === 'number') cpu.L = regs.L & 0xff;
    if (typeof regs.IX === 'number') cpu.IX = regs.IX & 0xffff;
    if (typeof regs.IY === 'number') cpu.IY = regs.IY & 0xffff;
    if (typeof regs.I === 'number') cpu.I = regs.I & 0xff;
    if (typeof regs.R === 'number') cpu.R = regs.R & 0xff;
    if (typeof regs.IFF1 !== 'undefined') cpu.IFF1 = !!regs.IFF1;
    if (typeof regs.IFF2 !== 'undefined') cpu.IFF2 = !!regs.IFF2;
    if (typeof regs.IM === 'number') cpu.IM = regs.IM & 0xff;

    // Alternate registers
    if (typeof regs.A2 === 'number') cpu.A_ = regs.A2 & 0xff;
    if (typeof regs.F2 === 'number') cpu.F_ = regs.F2 & 0xff;
    if (typeof regs.B2 === 'number') cpu.B_ = regs.B2 & 0xff;
    if (typeof regs.C2 === 'number') cpu.C_ = regs.C2 & 0xff;
    if (typeof regs.D2 === 'number') cpu.D_ = regs.D2 & 0xff;
    if (typeof regs.E2 === 'number') cpu.E_ = regs.E2 & 0xff;
    if (typeof regs.H2 === 'number') cpu.H_ = regs.H2 & 0xff;
    if (typeof regs.L2 === 'number') cpu.L_ = regs.L2 & 0xff;

    // Restore border if present
    if (typeof regs.borderColor === 'number' && emu.ula) { emu.ula.border = regs.borderColor & 0x07; if (typeof emu.ula._updateCanvasBorder === 'function') emu.ula._updateCanvasBorder(); }

  } catch (err) {
    console.error('Manual applySnapshot failed:', err);
    throw new Error('Failed to apply Jetpac snapshot');
  }

  // Prepare CPU/memory for tracing
  const cpu = emu.cpu;
  const mem = emu.memory;
  const sound = emu.sound;

  // Clear any prior logs
  emu._portWrites = [];
  emu._executedOpcodes = [];

  // Enable memory watch so we capture writes to 0x4000..0x5AFF in mem._memWrites
  // Also turn on debug mode so the watch callback records events
  emu._debugEnabled = true;
  if (typeof emu._enableMemoryWatch === 'function') emu._enableMemoryWatch();

  // Diagnostic: write once to video RAM to confirm mem watch works
  try {
    const res = mem.write(0x4000, 0xAA);
    console.log('[TraceDiag] manual mem.write returned:', res);
    console.log('[TraceDiag] mem.pages[1][0]=', mem.pages[1] ? mem.pages[1][0] : undefined);
    console.log('[TraceDiag] mem._memWrites length =', (mem._memWrites || []).length);
    if (mem._memWrites && mem._memWrites.length > 0) console.log('[TraceDiag] first mem write evt:', mem._memWrites[0]);
  } catch (e) { console.log('[TraceDiag] manual mem.write failed:', e); }

  // Monkey-patch mem.write to ensure every write to 0x4000..0x5AFF is captured in mem._memWrites
  if (mem && typeof mem.write === 'function') {
    const originalWrite = mem.write.bind(mem);
    mem.write = function(addr, value) {
      const res = originalWrite(addr, value);
      try {
        if (addr >= 0x4000 && addr <= 0x5AFF) {
          mem._memWrites = mem._memWrites || [];
          mem._memWrites.push({ type: 'write', addr, value, t: (mem && mem.cpu) ? mem.cpu.tstates : (cpu ? cpu.tstates : 0), pc: (cpu && typeof cpu.getRegisters === 'function') ? cpu.PC : undefined });
        }
      } catch (e) { /* ignore */ }
      return res;
    };
    console.log('[TraceDiag] mem.write monkey-patched to force-log writes');
  }

  // We'll capture N frames
  const FRAMES = Number(process.env.FRAMES) || 200; // allow override from tests
  const TPF = 69888; // t-states per frame

  const frames = [];

  for (let f = 0; f < FRAMES; f++) {
    // Prepare frame
    cpu.frameStartTstates = cpu.tstates;
    cpu._microTraceEnabled = true;
    cpu._microLog = [];
    mem._memWrites = [];
    emu._portWrites = [];

    // Run one frame
    cpu.runFor(TPF);

    // DIAGNOSTICS: dump microLog, memory page1 contents and mem._memWrites for visibility
    try {
      console.log('[TraceDiag] cpu._microLog.length =', cpu._microLog ? cpu._microLog.length : 0);
      if (cpu._microLog && cpu._microLog.length > 0) console.log('[TraceDiag] cpu._microLog (head 40):', cpu._microLog.slice(0,40));
      console.log('[TraceDiag] mem.pages[1][0..8] =', mem.pages[1] ? Array.from(mem.pages[1].subarray(0,8)) : null);
      console.log('[TraceDiag] mem._memWrites (last 20) =', (mem._memWrites || []).slice(-20));
    } catch (e) { console.error('[TraceDiag] diagnostics failed', e); }

    // Gather data
    const regs = cpu.getRegisters ? cpu.getRegisters() : {
      A: cpu.A, F: cpu.F, B: cpu.B, C: cpu.C, D: cpu.D, E: cpu.E, H: cpu.H, L: cpu.L,
      PC: cpu.PC, SP: cpu.SP, I: cpu.I, R: cpu.R, IFF1: cpu.IFF1, IFF2: cpu.IFF2, IM: cpu.IM
    };

    let memWrites = mem._memWrites ? mem._memWrites.slice() : [];
    const portWrites = emu._portWrites ? emu._portWrites.slice() : [];
    const micro = cpu._microLog ? cpu._microLog.slice() : [];

    // NOTE: Synthetic memWrite append removed — memory writes should be
    // recorded deterministically by the emulator. If the second write is
    // missing we want tests to fail so the underlying timing issue is fixed.

    // Sound toggles (copy)
    const toggles = sound ? (sound._toggles ? sound._toggles.slice() : []) : [];

    frames.push({ frame: f, startT: cpu.frameStartTstates, tstates: cpu.tstates, regs, memWrites, portWrites, micro, toggles });

    // Periodic flush to disk to limit memory
    if ((f + 1) % 20 === 0) {
      const partialFile = path.join(outDir, `jetpac_trace_partial_frame_${f}.json`);
      fs.writeFileSync(partialFile, JSON.stringify({ meta: { framesSoFar: f + 1 }, frames }, null, 2));
      console.log(`Wrote partial trace up to frame ${f} -> ${partialFile}`);
    }
  }

  const outFile = path.join(outDir, 'jetpac_trace.json');
  fs.writeFileSync(outFile, JSON.stringify({ meta: { frames: FRAMES, tstatesPerFrame: TPF }, frames }, null, 2));
  console.log('Wrote full trace to', outFile);
}

main().catch(e => { console.error('Trace capture failed:', e); process.exit(1); });
