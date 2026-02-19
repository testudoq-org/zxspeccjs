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
  const parsedPath = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');
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

  // Sync input/ULA and press '5' before running the first frame
  if (emu && emu._applyInputToULA) emu._applyInputToULA();
  emu.input.pressKey('5');
  if (emu && emu._applyInputToULA) emu._applyInputToULA();

  // Run a single frame (frame-0) and then inspect microLog + memWrites
  const TPF = 69888;
  emu.cpu.runFor(TPF);

  // 1) DB 0xFE polling -> look for IN microLog event addressing port low 0xFE
  const micro = Array.isArray(emu.cpu._microLog) ? emu.cpu._microLog.slice() : [];
  const inEvents = micro.filter(m => m && typeof m.type === 'string' && m.type.startsWith('IN'));
  const dbfe = inEvents.find(e => (e.port & 0xff) === 0xfe);
  expect(dbfe, 'expected an IN (0xFE) microLog event after pressing 5').toBeDefined();

  // 2) memWrite @0x4001 must have occurred during this frame
  const writes = Array.isArray(mem._memWrites) ? mem._memWrites.slice() : [];
  const wrote4001 = writes.some(w => w.addr === 0x4001);
  expect(wrote4001, 'expected a memWrite to 0x4001 in frame-0 after pressing 5').toBeTruthy();
}, 20000);
