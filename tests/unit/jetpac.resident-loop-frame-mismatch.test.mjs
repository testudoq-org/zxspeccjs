import { test, expect } from 'vitest';

// Reproduce the Jetpac "writes to 0x4800..0x49FF but framebuffer not updated" sequence
// Steps:
//  - create Emulator core (48K)
//  - apply a minimal 48K RAM snapshot containing the resident loop (same as E2E stub)
//  - set CPU.PC to the resident-loop entry and run the CPU for a short time
//  - assert: mem._memWrites contains rocket-area writes AND the FrameBuffer reflects those bytes
// This test is expected to FAIL on the current (broken) implementation to lock in the regression.

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }),
    toDataURL: () => ''
  };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

test('Jetpac resident loop produces memWrites in rocket area and framebuffer is updated (regression test)', async () => {
  const emu = await makeEmu();
  await emu._createCore(null);

  // Build minimal 48K RAM image and populate plausible screen contents
  const ram = new Uint8Array(0xC000).fill(0);
  for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;            // bitmap
  for (let i = 6144; i < 6912; i++) ram[i] = 0x47;                                   // attrs

  // Insert the tiny resident loop at snapshot offset 0x4000 (-> address 0x8000)
  const code = [
    0x21, 0x00, 0x48, // LD HL,0x4800
    0x3E, 0xAA,       // LD A,0xAA
    0x06, 0x10,       // LD B,0x10
    0x77,             // LD (HL),A
    0x23,             // INC HL
    0xD3, 0xFE,       // OUT (0xFE),A
    0x10, 0xFA,       // DJNZ loop (relative -6)
    0xC3, 0x03, 0x80  // JP 0x8003 (reload A/B)
  ];
  const codeOffset = 0x4000; // place at 0x8000 in address space
  for (let i = 0; i < code.length; i++) ram[codeOffset + i] = code[i];

  // Apply snapshot (do not auto-start emulator loop)
  const ok = await emu.applySnapshot({ snapshot: { ram } }, { fileName: 'jetpac-resident-stub', autoStart: false });
  expect(ok).toBe(true);

  // Sanity checks: framebuffer baseline & memory baseline
  const page1 = emu.memory.pages[1];
  expect(page1).toBeTruthy();
  const rocketOffset = 0x4800 - 0x4000; // 0x0800
  // baseline should not already be the value we'll write (0xAA)
  expect(page1[rocketOffset]).not.toBe(0xAA);

  // Ensure test harness hooks are present so memory.write will attempt auto-update
  globalThis.__TEST__ = globalThis.__TEST__ || {};
  globalThis.emu = emu;

  // Position CPU at the resident-loop entry and execute some cycles
  emu.cpu.PC = 0x8000;               // start at LD HL,0x4800 so HL is initialised
  emu.cpu.enableMicroTrace();        // capture micro-log for debugging
  emu.cpu.runFor(12000);             // run CPU for a while to let loop execute

  // Allow any microtask-scheduled frame updates to run
  await new Promise(r => setTimeout(r, 0));

  // Instrumentation to help diagnose the mismatch (attached to failing test output)
  const recentMemWrites = (emu.memory._memWrites || []).filter(w => w.addr >= 0x4800 && w.addr < 0x4A00);
  // Console logs will appear in test output for diagnostics
  // eslint-disable-next-line no-console
  console.log('RECENT_ROCKET_WRITES (count):', recentMemWrites.length);
  // eslint-disable-next-line no-console
  console.log('MEMWRITE sample:', recentMemWrites.slice(0, 12));
  // eslint-disable-next-line no-console
  console.log('CPU microLog tail:', emu.cpu.getMicroLog().slice(-16));
  // eslint-disable-next-line no-console
  console.log('CPU registers H/L, HL:', emu.cpu.H, emu.cpu.L, emu.cpu._getHL());

  // ASSERT 1: authoritative memory must contain rocket bytes written by the loop
  const foundInMem = Array.from(emu.memory.pages[1].slice(0x0800, 0x0800 + 0x10)).some(b => b === 0xAA);
  expect(foundInMem, 'expected rocket bytes (0xAA) in memory page[1] after running resident loop').toBeTruthy();

  // ASSERT 2 (the regression): FrameBuffer should reflect those memory writes
  // Compute FrameBuffer pointer for bitmapAddr = 0x0800 -> y=64, xByte=0
  const FB_BASE = 24 * 160;
  const LINE_STRIDE = 96;
  const y = 64;
  const lineOffset = FB_BASE + y * LINE_STRIDE;
  const cellStart = lineOffset + 16 + 0 * 2; // first main-screen byte for xByte=0
  const fb = emu.ula.frameBuffer.getBuffer();

  // This is the expected value (0xAA) — current implementation is failing here in E2E
  expect(fb[cellStart], `framebuffer byte for 0x4800 (buf@${cellStart}) should equal 0xAA`).toBe(0xAA);
});
