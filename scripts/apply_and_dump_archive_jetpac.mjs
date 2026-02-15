#!/usr/bin/env node
import fs from 'fs';
import { Loader } from '../src/loader.mjs';
import { Emulator } from '../src/main.mjs';
import { Z80 } from '../src/z80.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

async function main(){
  // Minimal DOM shims for Node environment (used in other test scripts)
  if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, __TEST__: {} };
  if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

  console.log('Fetching .z80 from Archive.org...');
  const res = await fetch(URL);
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) {
    console.error('Parsed snapshot missing RAM');
    process.exit(2);
  }

  // Create emulator with canvas stub
  const canvasStub = { width:320, height:240, style: {}, getContext: ()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{}, imageSmoothingEnabled:false }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);

  const ram = parsed.snapshot.ram;
  // Apply ram into emulator pages
  emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();

  // Set registers on CPU
  emu.cpu = new Z80(emu.memory);
  const regs = parsed.snapshot.registers || {};
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
  if (typeof regs.IX === 'number') emu.cpu.IX = regs.IX & 0xffff;
  if (typeof regs.IY === 'number') emu.cpu.IY = regs.IY & 0xffff;
  if (typeof regs.I === 'number') emu.cpu.I = regs.I & 0xff;
  if (typeof regs.R === 'number') emu.cpu.R = regs.R & 0xff;

  // Generate frame buffer and render once (deferred rendering path)
  if (emu.ula && emu.ula.frameBuffer) {
    emu.ula.frameBuffer.generateFromMemory();
    const fbBuf = emu.ula.frameBuffer.getBuffer();
    // Save a quick sample of the framebuffer bytes
    fs.writeFileSync('./traces/jetpac_framebuffer_sample.json', JSON.stringify({ first64: Array.from(fbBuf.slice(0,64)).map(b=>b.toString(16).padStart(2,'0')) }));
  }

  // Dump applied RAM region (0x4000..0x57FF)
  const screen = emu.memory.pages[1].subarray(0x0000, 0x1800);
  fs.writeFileSync('./traces/jetpac_ram_applied_0x4000_0x57FF.bin', Buffer.from(screen));
  console.log('Wrote emulator-applied RAM to traces/jetpac_ram_applied_0x4000_0x57FF.bin');

  // Compare emulator-applied RAM with parsed snapshot RAM
  const ref = ram.subarray(0x0000, 0x1800);
  let mismatches = 0; let first = -1;
  for (let i=0;i<ref.length;i++) if (ref[i] !== screen[i]) { mismatches++; if (first===-1) first=i; }
  if (mismatches===0) console.log('Applied RAM matches parsed snapshot exactly.'); else console.log(`Applied RAM differs from parsed snapshot: ${mismatches} mismatches, first at 0x${first.toString(16)}`);

  // Also compute SHA256 of applied RAM
  try {
    const { createHash } = await import('crypto');
    const sha = createHash('sha256').update(screen).digest('hex');
    console.log('SHA256(applied screen dump)=', sha);
  } catch (e) { /* best-effort */ }
}

main().catch(e=>{ console.error(e); process.exit(1); });