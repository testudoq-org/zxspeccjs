import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

// Ensure pressing '5' in the parsed Jetpac snapshot triggers the ROM keyboard
// polling (DB 0xFE / IN (0xFE)) and produces the expected screen memWrite at
// 0x4001 within the first frame.

test('Jetpac: pressing 5 executes DB 0xFE polling and writes to 0x4001 in frame-0', async () => {
  const { Emulator } = await import('../../src/main.mjs');
  const { Z80 } = await import('../../src/z80.mjs');

  // minimal canvas stub
  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {} }),
    toDataURL: () => ''
  };

  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);

  // Load the local parsed Jetpac snapshot (offline, deterministic)
  const parsedPath = path.resolve('traces', 'parsed_jetpac_snapshot.json');
  expect(fs.existsSync(parsedPath)).toBe(true);
  const json = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));

  const RAM_48K = 3 * 16384;
  const ramBuf = new Uint8Array(RAM_48K);
  if (Array.isArray(json.ram)) {
    ramBuf.set(json.ram.slice(0, RAM_48K));
  } else if (json.ram && typeof json.ram === 'object') {
    for (const k of Object.keys(json.ram)) {
      const idx = parseInt(k, 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < RAM_48K) ramBuf[idx] = json.ram[k] & 0xff;
    }
  }

  // Install RAM into emulator pages
  if (emu.memory.pages[1]) emu.memory.pages[1].set(ramBuf.subarray(0x0000, 0x4000));
  if (emu.memory.pages[2]) emu.memory.pages[2].set(ramBuf.subarray(0x4000, 0x8000));
  if (emu.memory.pages[3]) emu.memory.pages[3].set(ramBuf.subarray(0x8000, 0xC000));
  if (typeof emu.memory._syncFlatRamFromBanks === 'function') emu.memory._syncFlatRamFromBanks();

  // Ensure CPU exists and apply registers from snapshot (if present)
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

  // Instrument CPU micro-log and memory writes
  emu.cpu._microTraceEnabled = true;
  emu.cpu._microLog = [];

  const mem = emu.memory;
  // Monkey-patch mem.write to capture writes in 0x4000..0x5AFF for assertion
  const origWrite = mem.write.bind(mem);
  mem._memWrites = [];
  mem.write = function (addr, value) {
    const res = origWrite(addr, value);
    try {
      if (addr >= 0x4000 && addr <= 0x5AFF) {
        mem._memWrites.push({ type: 'write', addr, value, t: (emu.cpu && emu.cpu.tstates) || 0, pc: emu.cpu ? emu.cpu.PC : undefined });
      }
    } catch (e) { /* ignore */ }
    return res;
  };

  // Warm the snapshot for a few frames so we're in a comparable execution
  // state to the reference emulator, then press '5' and run one frame to
  // capture the ROM keyboard poll + rocket-area writes. This removes the
  // brittle dependency on an exact PC in the parsed snapshot.
  const TPF = 69888;
  // Warm 5 frames using the emulator's per-frame helper so ULA interrupts
  // and frame-final processing occur exactly as in the main loop.
  for (let i = 0; i < 5; i++) emu._runCpuForFrame();

  // Now press '5' and run a single frame to capture IN/OUT and memWrites
  // The parsed Jetpac snapshot now includes interrupts enabled (IFF1=true).
  // No manual IFF flip is necessary — run with the snapshot state as-is.
  emu.input.pressKey('5');
  if (emu && emu._applyInputToULA) emu._applyInputToULA();

  // Run two frames: the ULA requests the interrupt at end-of-frame, the
  // ROM's keyboard-poll ISR will execute on the following frame. Running
  // a second frame ensures the interrupt is serviced and any screen writes
  // produced by the ROM are observable in mem._memWrites.
  emu._runCpuForFrame();
  emu._runCpuForFrame();

  // DIAGNOSTICS: print CPU / micro-log / ULA / memory state to help debug why
  // the ROM keyboard-poll path didn't produce the rocket-area memWrite at 0x4001.
  try {
    console.log('DEBUG: CPU PC=0x' + (emu.cpu && typeof emu.cpu.PC === 'number' ? emu.cpu.PC.toString(16) : 'n/a'));
    console.log('DEBUG: cpu.tstates=', emu.cpu ? emu.cpu.tstates : 'n/a');

    // Show the full microLog tail and then look for IN (0xFE) events and any
    // subsequent MEMWRITE to 0x4001 within the next 200 micro-events.
    const microLog = Array.isArray(emu.cpu._microLog) ? emu.cpu._microLog.slice() : [];
    console.log('DEBUG: cpu._microLog length=', microLog.length);
    console.log('DEBUG: last microLog entries (tail 80)=', microLog.slice(-80));

    const inEvents = microLog.map((m, i) => ({ i, e: m })).filter(x => x.e && typeof x.e.type === 'string' && x.e.type.startsWith('IN'));
    console.log('DEBUG: IN events found (indexes):', inEvents.map(x => x.i));

    // For each IN event, scan ahead in microLog for MEMWRITE to 0x4001
    inEvents.forEach(({ i }) => {
      const window = microLog.slice(i, i + 200);
      const wrote4001 = window.find(m => m && m.type === 'MEMWRITE' && m.addr === 0x4001);
      console.log(`DEBUG: IN at index ${i} -> memWrite@0x4001 in next 200 events?`, !!wrote4001);
      if (wrote4001) console.log('DEBUG: matching MEMWRITE (context)=', wrote4001);
      else console.log('DEBUG: microLog window after IN (first 40)=', window.slice(0, 40));
    });

    console.log('DEBUG: last mem._memWrites (tail 80)=', Array.isArray(mem._memWrites) ? mem._memWrites.slice(-80) : []);
    if (emu.ula && typeof emu.ula.readPort === 'function') {
      try { console.log('DEBUG: ULA.readPort(0xFE)=0x' + emu.ula.readPort(0xFE).toString(16)); } catch (e) { console.log('DEBUG: ULA.readPort(0xFE) failed', e.message); }
    }
    console.log('DEBUG: ULA.keyMatrix=', emu.ula && emu.ula.keyMatrix ? Array.from(emu.ula.keyMatrix) : null);
    console.log('DEBUG: input.matrix=', emu.input && emu.input.matrix ? Array.from(emu.input.matrix) : null);
    try { console.log('DEBUG: mem[0x4000..0x4003]=', mem.read(0x4000), mem.read(0x4001), mem.read(0x4002), mem.read(0x4003)); } catch (e) { console.log('DEBUG: mem.read failed', e.message); }
  } catch (e) { console.log('DEBUG: diagnostics failed', e && e.message); }

  // 1) DB 0xFE polling -> look for IN microLog event addressing port low 0xFE
  const micro = Array.isArray(emu.cpu._microLog) ? emu.cpu._microLog.slice() : [];
  const inEvents = micro.filter(m => m && typeof m.type === 'string' && m.type.startsWith('IN'));
  const dbfe = inEvents.find(e => (e.port & 0xff) === 0xfe);
  expect(dbfe, 'expected an IN (0xFE) microLog event after pressing 5').toBeDefined();

  // 2) memWrite @0x4001 must have occurred during this frame
  const writes = Array.isArray(mem._memWrites) ? mem._memWrites.slice() : [];
  const wrote4001 = writes.some(w => w.addr === 0x4001);
  if (!wrote4001) {
    // extra diagnostic output on failure (keeps test failure message informative)
    console.log('DIAG: did not find memWrite@0x4001 in mem._memWrites; full tail=');
    console.log(writes.slice(-64));
  }
  expect(wrote4001, 'expected a memWrite to 0x4001 in the frame after pressing 5').toBeTruthy();
}, 20000);
