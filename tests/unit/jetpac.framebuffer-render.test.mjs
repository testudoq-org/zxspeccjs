/* eslint-disable no-console, no-undef, no-empty */
import { test, expect } from 'vitest';

// Focused TDD: ensure that after START (key '5') the emulator not only
// performs memWrites into 0x4800..0x49FF but also that the FrameBuffer's
// generated output reflects those same bitmap bytes (detects mem vs render
// regressions).

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

  // Place an active routine at 0x8000 that writes into 0x4800..0x49FF (rocket
  // area) and then writes a few bytes into 0x4000..0x47FF (enemy area).
  const code = [
    0x21,0x00,0x48, // LD HL,0x4800
    0x11,0x00,0x40, // LD DE,0x4000
    0x3E,0xAA,      // LD A,0xAA
    0x06,0x10,      // LD B,0x10  ; rocket writes count (16)
    // rocket loop: LD (HL),A ; INC HL ; OUT (0xFE),A ; DJNZ -5
    0x77,0x23,0xD3,0xFE,0x10,0xFA,
    // then write 4 enemy bytes into 0x4000..0x4003
    0x06,0x04,0x12,0x13,0x10,0xFC,
    0xC3,0x00,0x80 // JP 0x8000
  ];
  for (let i = 0; i < code.length; i++) ram[0x8000 + i] = code[i];

  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out.buffer;
}

// Helpers to locate bitmap byte inside the FrameBuffer buffer
function bitmapIndexToYx(bitmapIndex) {
  // In FrameBuffer._fillMainScreen the mapping is:
  // bitmapAddr = (y0 << 8) | (y1 << 5) | (y2 << 11) | xByte
  const xByte = bitmapIndex & 0x1F;
  const y0 = (bitmapIndex >> 8) & 0x7;
  const y1 = (bitmapIndex >> 5) & 0x7;
  const y2 = (bitmapIndex >> 11) & 0x3;
  const y = y0 + (y1 << 3) + (y2 << 6);
  return { y, xByte };
}

function readBitmapByteFromFBBuffer(fbBuffer, bitmapIndex) {
  const TOP_BORDER_BYTES = 24 * 160; // FrameBuffer._fillTopBorder
  const LINE_BYTES = 96;             // per main-screen line in buffer
  const { y, xByte } = bitmapIndexToYx(bitmapIndex);
  const lineStart = TOP_BORDER_BYTES + (y * LINE_BYTES);
  const bytePos = lineStart + 16 + (xByte * 2); // 16 border bytes + (bitmap,attr) pairs
  return fbBuffer[bytePos];
}

test('Jetpac framebuffer render reflects memWrites to 0x4800..0x49FF after START', async () => {
  const { Emulator } = await import('../../src/main.mjs');
  const { Loader } = await import('../../src/loader.mjs');
  const { Z80 } = await import('../../src/z80.mjs');

  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{}, imageSmoothingEnabled:false }),
    toDataURL: () => ''
  };

  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });

  const payload = generateJetpacZ80Payload();
  const parsed = Loader.parseZ80(payload);
  await emu._createCore(parsed.rom || null);

  const ram = parsed.snapshot && parsed.snapshot.ram;
  if (ram && ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }

  if (!emu.cpu) emu.cpu = new Z80(emu.memory);
  emu.cpu.PC = parsed.snapshot.registers.PC || 0x8000;
  emu.cpu.SP = parsed.snapshot.registers.SP || 0xFF00;

  // Instrument mem writes and ensure we capture writes into the rocket area
  const mem = emu.memory;
  mem._memWrites = [];
  const origWrite = mem.write.bind(mem);
  mem.write = function(addr, value) {
    const res = origWrite(addr, value);
    try { if (addr >= 0x4000 && addr <= 0x5AFF) mem._memWrites.push({ addr, value, t: (emu.cpu && emu.cpu.tstates) || 0, pc: emu.cpu ? emu.cpu.PC : 0 }); } catch (e) { /* ignore */ void 0; }
    return res;
  };

  emu._portWrites = [];
  const origUlaOut = emu.ula && emu.ula.writePort ? emu.ula.writePort.bind(emu.ula) : null;
  if (origUlaOut) emu.ula.writePort = function(port, value) { emu._portWrites.push({ port, value, t: (emu.cpu && emu.cpu.tstates) || 0, pc: emu.cpu ? emu.cpu.PC : 0 }); return origUlaOut(port, value); };

  // Run until sequence observed or timeout
  const FRAMES = 120;
  const TPF = 69888;
  const PRESS_FRAME = 2;
  const PRESS_DURATION = 2;

  let observed = false;
  for (let f = 0; f < FRAMES; f++) {
    if (f === PRESS_FRAME) { try { emu.input.pressKey('5'); } catch (e) { void 0; } }
    if (f === PRESS_FRAME + PRESS_DURATION) { try { emu.input.releaseKey('5'); } catch (e) { void 0; } }

    emu.cpu.runFor(TPF);

    const rocketWrites = (mem._memWrites || []).filter(w => w.addr >= 0x4800 && w.addr <= 0x49FF);
    const portFE = (emu._portWrites || []).find(p => (p.port & 0xff) === 0xFE);
    if (rocketWrites.length > 0 && portFE) { observed = true; break; }
  }

  expect(observed, 'expected START sequence (rocket memWrites + beep)').toBeTruthy();

  // Now generate a framebuffer from memory and assert rocket bitmap was rendered
  expect(emu.ula && emu.ula.frameBuffer && typeof emu.ula.frameBuffer.generateFromMemory === 'function', 'frameBuffer available').toBeTruthy();
  emu.ula.frameBuffer.generateFromMemory();
  const fb = emu.ula.frameBuffer.getBuffer();
  expect(fb && fb.length > 0, 'frameBuffer must produce bytes').toBeTruthy();

  // Compare the 0x4800..0x483F image bytes in the FrameBuffer against
  // the source bytes in memory.pages[1][0x0800..0x083F]
  const expected = Array.from(emu.memory.pages[1].subarray(0x0800, 0x0840));
  const actual = [];
  for (let i = 0; i < expected.length; i++) {
    const bitmapIdx = 0x0800 + i; // index into bitmap array used by FrameBuffer
    actual.push(readBitmapByteFromFBBuffer(fb, bitmapIdx));
  }

  // If they differ, include a short hex-diff in the assertion message
  const mismatches = expected.map((b, idx) => ({ idx, exp: b, act: actual[idx] })).filter(r => r.exp !== r.act);
  expect(mismatches.length, `framebuffer vs memory bitmap mismatch count=${mismatches.length} sample=${JSON.stringify(mismatches.slice(0,4))}`).toBe(0);
});
