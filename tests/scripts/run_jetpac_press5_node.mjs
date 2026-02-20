#!/usr/bin/env node
import fs from 'fs';
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

// Simple script to load Jetpac .z80 snapshot, press '5', run a few frames and
// dump keyMatrix / portReads / rocket memWrites for diagnosis.

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

async function main() {
  // minimal DOM / canvas stub for Emulator
  if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {}, __TEST__: {} };
  if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

  console.log('Fetching Jetpac .z80...');
  const res = await fetch(URL);
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  if (!parsed || !parsed.snapshot || !parsed.snapshot.ram) {
    console.error('Parsed snapshot missing RAM');
    process.exit(2);
  }

  const canvasStub = { width:320, height:240, style: {}, getContext: ()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{}, imageSmoothingEnabled:false }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);

  // Apply ram/pages
  const ram = parsed.snapshot.ram;
  emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();

  // CPU regs — reuse emulator's CPU instance created by _createCore so its IO adapter is attached
  if (!emu.cpu) emu.cpu = new Z80(emu.memory);
  const regs = parsed.snapshot.registers || {};
  console.log('Parsed snapshot registers (sample):', { PC: regs.PC, I: regs.I, R: regs.R, IFF1: regs.IFF1, IFF2: regs.IFF2, IM: regs.IM });
  if (typeof regs.PC === 'number') emu.cpu.PC = regs.PC & 0xffff;
  // After applying registers, surface CPU interrupt flags for diagnosis
  console.log('After apply: CPU IFF1=', !!emu.cpu.IFF1, 'IFF2=', !!emu.cpu.IFF2, 'IM=', emu.cpu.IM, 'I=', emu.cpu.I);
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

  // Prepare ULA deferred rendering (generateFromMemory available)
  if (emu.ula && emu.ula.frameBuffer) {
    emu.ula.frameBuffer.generateFromMemory();
  }

  // Ensure ROM sees keyboard mapping; sync input
  emu._applyInputToULA();

  console.log('Initial ULA.keyMatrix (rows 0..7):', Array.from(emu.ula.keyMatrix).map(v => '0x'+v.toString(16)));

  // Step 5 frames to let ROM settle
  console.log('Stepping 5 frames (no input)');
  // Enable frame tracing so port reads are captured into emu._tracePortReads
  emu.setTracing(true);
  // Enable CPU micro-tracing to capture IN/OUT at opcode level for diagnosis
  if (emu.cpu && typeof emu.cpu.enableMicroTrace === 'function') emu.cpu.enableMicroTrace();
  for (let i = 0; i < 5; i++) {
    emu._runCpuForFrame();
  }

  console.log('Pressing key "5" via input.pressKey("5")');
  emu.input.pressKey('5');
  // Immediately sync to ULA (should already be done by pressKey)
  emu._applyInputToULA();

  console.log('ULA.keyMatrix after press:', Array.from(emu.ula.keyMatrix).map(v => '0x'+v.toString(16)));

  // Run a few frames and collect portReads / memWrites; also print PC per frame
  const reads = [];
  const memWrites = [];
  for (let f = 0; f < 12; f++) {
    // reset per-frame trace collections in emulator
    emu._tracePortReads = [];
    if (emu.memory) emu.memory._memWrites = [];

    emu._runCpuForFrame();

    // record PC and a small opcode sample near PC for diagnosis
    try {
      const pc = emu.cpu.PC & 0xffff;
      const ops = [];
      for (let i = 0; i < 8; i++) ops.push(emu.memory.read((pc + i) & 0xffff));
      console.log(`Frame ${f}: PC=0x${pc.toString(16).padStart(4,'0')} nextBytes=[${ops.map(b=>b.toString(16).padStart(2,'0')).join(' ')}] tstates=${emu.cpu.tstates}`);
    } catch (e) { console.log('Frame pc/ops read failed', e); }

    // gather any port reads from this frame
    if (Array.isArray(emu._tracePortReads) && emu._tracePortReads.length) {
      reads.push(...emu._tracePortReads.filter(r => (r.port & 0xff) === 0xfe));
    }
    if (emu.memory && Array.isArray(emu.memory._memWrites) && emu.memory._memWrites.length) {
      memWrites.push(...emu.memory._memWrites.filter(w => (w.addr >= 0x4800 && w.addr <= 0x49FF)).slice(-20));
    }
  }

  console.log('Collected portReads (0xFE) after pressing 5:');
  console.log(JSON.stringify(reads.slice(0,40), null, 2));

  // Also surface any CPU micro-log IN events (DB/ED variants) for diagnosis
  const microLog = (emu.cpu && Array.isArray(emu.cpu._microLog)) ? emu.cpu._microLog.slice() : [];
  const inEvents = microLog.map((m, i) => ({ i, e: m })).filter(x => x.e && typeof x.e.type === 'string' && x.e.type.startsWith('IN'));
  console.log('Collected CPU micro IN events (indexes):', inEvents.map(x => x.i));

  // For each IN event, check if PC_HIT (PC==0x0039) or MEMWRITE@0x4001 happens within next 300 microLog entries
  const analyses = inEvents.map(({ i }) => {
    const window = microLog.slice(i, i + 300);
    const pcHit = window.find(w => w && w.type === 'PC_HIT');
    const mem4001 = window.find(w => w && w.type === 'MEMWRITE' && w.addr === 0x4001);
    return { inIndex: i, pcHit: !!pcHit, mem4001: !!mem4001, pcHitAt: pcHit ? pcHit.t : null, mem4001At: mem4001 ? mem4001.t : null };
  });
  console.log('IN -> PC_HIT / MEM4001 correlation:', JSON.stringify(analyses, null, 2));

  console.log('Collected rocket-area memWrites (sample):');
  console.log(JSON.stringify(memWrites.slice(0,40), null, 2));

  console.log('Final ULA.keyMatrix:', Array.from(emu.ula.keyMatrix).map(v => '0x'+v.toString(16)));

  // Also try the authoritative IN path: call ula.readPort with a high byte that selects the row
  // Row that contains '5' is ROW_KEYS[3] index 4 → row 3, mask = 1<<4
  const row = 3;
  const highSelect = ~(1 << row) & 0xff;
  const portValue = emu.ula.readPort((highSelect << 8) | 0xfe);
  console.log(`Direct ULA.readPort for row ${row} (select=${(highSelect).toString(16)}): 0x${portValue.toString(16)}`);

  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });