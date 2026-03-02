/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

// This test verifies that warming the parsed Jetpac snapshot by 5 frames
// produces the same PC and R register values as the canonical jsspeccy
// reference trace. The failure highlights the seed/timing mismatch that
// currently prevents enemies/rockets from appearing during gameplay.

test('Jetpac: warming snapshot yields reference PC/R', async () => {
  const { Emulator } = await import('../../src/main.mjs');
  const { Z80 } = await import('../../src/z80.mjs');

  // create emulator with minimal stubs
  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {} }),
    toDataURL: () => ''
  };

  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);

  // load parsed snapshot
  const parsedPath = path.resolve('traces', 'parsed_jetpac_snapshot.json');
  expect(fs.existsSync(parsedPath)).toBe(true);
  const json = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));

  // apply RAM if provided
  if (json.ram) {
    const RAM_48K = 3 * 16384;
    const ramBuf = new Uint8Array(RAM_48K);
    if (Array.isArray(json.ram)) {
      ramBuf.set(json.ram.slice(0, RAM_48K));
    } else if (typeof json.ram === 'object') {
      for (const k of Object.keys(json.ram)) {
        const idx = parseInt(k, 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < RAM_48K) ramBuf[idx] = json.ram[k] & 0xff;
      }
    }
    if (emu.memory.pages[1]) emu.memory.pages[1].set(ramBuf.subarray(0,0x4000));
    if (emu.memory.pages[2]) emu.memory.pages[2].set(ramBuf.subarray(0x4000,0x8000));
    if (emu.memory.pages[3]) emu.memory.pages[3].set(ramBuf.subarray(0x8000,0xC000));
    if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();
  }

  // apply registers from parsed snapshot; do **not** override from the
  // external reference.  The canonical trace file describes the state
  // *after* one warm-up frame, whereas the snapshot JSON is the pre-warm
  // state.  We'll run that frame manually below and then compare against
  // the reference with a one-frame offset.
  const regs = json.registers || {};
  if (typeof regs.PC === 'number') emu.cpu.PC = regs.PC & 0xffff;
  if (typeof regs.SP === 'number') emu.cpu.SP = regs.SP & 0xffff;
  if (typeof regs.A === 'number') emu.cpu.A = regs.A & 0xff;
  if (typeof regs.F === 'number') emu.cpu.F = regs.F & 0xff;
  if (typeof regs.B === 'number') emu.cpu.B = regs.B & 0xff;
  if (typeof regs.C === 'number') emu.cpu.C = regs.C & 0xff;
  if (typeof regs.D === 'number') emu.cpu.D = regs.D & 0xff;
  if (typeof regs.E === 'number') emu.cpu.E = regs.E & 0xff;
  if (typeof regs.H === 'number') emu.cpu.H = regs.H & 0xff;
  if (typeof regs.L === 'number') emu.cpu.L = regs.L & 0xff;
  if (typeof regs.I === 'number') emu.cpu.I = regs.I & 0xff;
  if (typeof regs.R === 'number') emu.cpu.R = regs.R & 0xff;
  if (typeof regs.IFF1 !== 'undefined') emu.cpu.IFF1 = !!regs.IFF1;
  if (typeof regs.IFF2 !== 'undefined') emu.cpu.IFF2 = !!regs.IFF2;
  if (typeof regs.IM === 'number') emu.cpu.IM = regs.IM & 0xff;

  // The reference trace begins after one warm-up frame; replicate that
  // so our observed frames line up.  After this call, seen[0] should
  // correspond to ref.frames[1].regs rather than ref.frames[0].regs.
  emu._runCpuForFrame();
  // the snapshot may leave interrupts disabled; we no longer assert IFF1
  // explicitly here – the comparison to reference below will catch any
  // mismatch if it matters.

  const seen = [];
  for (let i = 0; i < 5; i++) {
    emu._runCpuForFrame();
    seen.push({ pc: emu.cpu.PC, r: emu.cpu.R });
  }

  // compare to reference registers for each frame
  const refPath = path.resolve('traces', 'jsspeccy_reference_jetpac_trace.json');
  expect(fs.existsSync(refPath)).toBe(true);
  const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
  const refFrames = ref.frames || [];
  expect(refFrames.length).toBeGreaterThanOrEqual(seen.length);

  for (let i = 0; i < seen.length; i++) {
    // offset by one because of the initial warm-up above
    const refRegs = refFrames[i + 1] && refFrames[i + 1].regs;
    expect(refRegs, `reference frame ${i + 1} regs`).toBeDefined();
    expect(seen[i].pc).toBe(refRegs.PC);
    expect(seen[i].r).toBe(refRegs.R);
    // also ensure IFF1 status matches reference (should be false after warm)
    expect(emu.cpu.IFF1).toBe(refRegs.IFF1);
  }
}, 20000);
