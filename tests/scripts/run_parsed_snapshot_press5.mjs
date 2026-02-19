#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/* eslint no-console: 0 */
import fs from 'fs';
import path from 'path';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

async function main() {
  const parsedPath = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');
  if (!fs.existsSync(parsedPath)) throw new Error('parsed snapshot missing');
  const json = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));
  const RAM_48K = 3 * 16384;
  const ramBuf = new Uint8Array(RAM_48K);
  if (Array.isArray(json.ram)) ramBuf.set(json.ram.slice(0, RAM_48K));
  else if (json.ram && typeof json.ram === 'object') {
    for (const k of Object.keys(json.ram)) {
      const idx = parseInt(k, 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < RAM_48K) ramBuf[idx] = json.ram[k] & 0xff;
    }
  }

  const canvasStub = { width:320, height:240, style:{}, getContext: ()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{} }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);

  if (emu.memory.pages[1]) emu.memory.pages[1].set(ramBuf.subarray(0x0000, 0x4000));
  if (emu.memory.pages[2]) emu.memory.pages[2].set(ramBuf.subarray(0x4000, 0x8000));
  if (emu.memory.pages[3]) emu.memory.pages[3].set(ramBuf.subarray(0x8000, 0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();

  if (!emu.cpu) emu.cpu = new Z80(emu.memory);
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

  console.log('Initial PC:', emu.cpu.PC.toString(16));

  // Warm 5 frames (use _runCpuForFrame to match emulator loop semantics)
  for (let i = 0; i < 5; i++) emu._runCpuForFrame();
  console.log('After warming: PC=', emu.cpu.PC.toString(16), 'R=', emu.cpu.R);

  // Press 5 and run one frame
  emu.input.pressKey('5');
  if (emu && emu._applyInputToULA) emu._applyInputToULA();
  emu._runCpuForFrame();

  console.log('microLog IN events (tail 40):', (emu.cpu._microLog||[]).filter(m=>m && typeof m.type==='string' && m.type.startsWith('IN')).slice(-40));
  console.log('mem._memWrites (tail 40):', (emu.memory._memWrites||[]).slice(-40));
}

main().catch(e=>{ console.error(e); process.exit(1); });