/* eslint-disable no-console */
/**
 * Tests for the post-load warm-up frame in applySnapshot().
 *
 * The warm-up runs one frame (matching jsspeccy3) with the interrupt queued
 * at the frame start via _runCpuForFrame().  For the tstates===0 path (v1
 * snapshots like Jetpac), IFF1/IFF2 are forced to true so the ISR fires
 * during the warm-up frame — matching jsspeccy3's reference trace which
 * shows the ISR serviced in frame 0 (only 2 value-changing memWrites).
 *
 * The ISR's own EI/RETI sequence restores the correct IFF1 value; normal
 * gameplay frames use the 32T time-window model with whatever IFF1 the
 * game leaves.
 */
import { describe, it, expect } from 'vitest';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { getElementById: () => null };
}

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = {
    width: 320, height: 240, style: {},
    getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
      putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false
    }),
    toDataURL: () => ''
  };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  await emu._createCore(null);
  return emu;
}

/**
 * Build a 48K RAM image containing:
 *  - IM 2 vector table (I=0x50): 0x50FF→lo, 0x5100→hi point to ISR at 0x5200
 *  - ISR at 0x5200: LD A,0x42 / LD (0x5700),A / EI / RETI
 *    (EI+RETI restores IFF1; flag at 0x5700 becomes 0x42 proving ISR ran)
 *  - JR $ tight loop at 0x8000
 *
 * Using IM 2 lets us use a fully RAM-resident ISR that does not depend on the
 * ROM being present (the test environment loads ROM as all-0xFF which would
 * trap the CPU in an RST-38 recursion under IM 1).
 *
 * RAM logical addresses start at 0x4000, so ram[i] = logical 0x4000+i.
 */
const ISR_ADDR    = 0x5200; // where our ISR lives
const FLAG_ADDR   = 0x5700; // marker written by ISR to prove it executed
const MAIN_ADDR   = 0x8000; // JR $ main loop
const I_REG       = 0x50;   // IM2 interrupt register (vector table at 0x50FF)
const VECTOR_LO   = ISR_ADDR & 0xFF;         // 0x00
const VECTOR_HI   = (ISR_ADDR >>> 8) & 0xFF; // 0x52
const RAM_BASE    = 0x4000;

function makeRamWithIm2Isr() {
  const ram = new Uint8Array(3 * 0x4000); // 48 KiB (logical 0x4000–0xFFFF)

  // IM 2 vector table: interrupt vector at (I<<8)|0xFF = 0x50FF
  const vecOff = (I_REG << 8 | 0xFF) - RAM_BASE; // 0x10FF
  ram[vecOff]   = VECTOR_LO; // lo byte of ISR_ADDR
  ram[vecOff+1] = VECTOR_HI; // hi byte of ISR_ADDR

  // ISR at ISR_ADDR: write marker, EI, RETI
  const isrOff = ISR_ADDR - RAM_BASE; // 0x1200
  ram[isrOff  ] = 0x3E; // LD A, n
  ram[isrOff+1] = 0x42; // n = 0x42 (marker)
  ram[isrOff+2] = 0x32; // LD (nn), A
  ram[isrOff+3] = FLAG_ADDR & 0xFF;         // nn lo
  ram[isrOff+4] = (FLAG_ADDR >>> 8) & 0xFF; // nn hi
  ram[isrOff+5] = 0xFB; // EI
  ram[isrOff+6] = 0xED; // RETI (ED 4D)
  ram[isrOff+7] = 0x4D;

  // Main loop at MAIN_ADDR
  const mainOff = MAIN_ADDR - RAM_BASE; // 0x4000
  ram[mainOff  ] = 0x18; // JR e
  ram[mainOff+1] = 0xFE; // e = -2  → JR $ (loop forever)

  return ram;
}

/**
 * Snapshot registers for IM2 warm-up tests:
 *  - PC starts in the main JR $ loop
 *  - SP points to a valid stack area
 *  - IFF1=false (as the raw .z80 stores it while inside an ISR)
 *  - IM=2, I=0x50 so the IM2 vector table lands in RAM
 */
function im2Regs(extra = {}) {
  return { PC: MAIN_ADDR, SP: 0xFF00, IFF1: false, IFF2: false, IM: 2, I: I_REG, ...extra };
}

describe('applySnapshot warm-up – interrupt generation and IFF1 behaviour', () => {
  it('_runCpuForFrame queues intRequested during warm-up (via generateInterruptSync)', async () => {
    const emu = await makeEmu();

    // Spy on cpu.runFor to capture intRequested at the moment it is called.
    // _runCpuForFrame calls generateInterruptSync() => intRequested=true
    // before calling cpu.runFor().
    let intRequestedAtRunForEntry = undefined;
    const origRunFor = emu.cpu.runFor.bind(emu.cpu);
    emu.cpu.runFor = function (n) {
      if (intRequestedAtRunForEntry === undefined) {
        intRequestedAtRunForEntry = emu.cpu.intRequested;
      }
      return origRunFor(n);
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()   // IFF1=false
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'warmtest', autoStart: false });

    // intRequested must have been true when cpu.runFor started (set by
    // generateInterruptSync inside _runCpuForFrame)
    expect(intRequestedAtRunForEntry).toBe(true);
  });

  it('IM2 ISR runs during warm-up when snapshot has IFF1=true', async () => {
    const emu = await makeEmu();

    expect(emu.memory.read(FLAG_ADDR)).toBe(0);

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs({ IFF1: true, IFF2: true })  // interrupts enabled
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'isrtest', autoStart: false });

    // ISR wrote 0x42 to FLAG_ADDR — proves the interrupt fired and ISR completed
    expect(emu.memory.read(FLAG_ADDR)).toBe(0x42);
  });

  it('ISR runs during warm-up when snapshot has IFF1=false (forced for jsspeccy3 parity)', async () => {
    const emu = await makeEmu();

    expect(emu.memory.read(FLAG_ADDR)).toBe(0);

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()   // IFF1=false — like Jetpac
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'noIsrTest', autoStart: false });

    // IFF1 is forced true for warm-up, so ISR must have run
    expect(emu.memory.read(FLAG_ADDR)).toBe(0x42);
  });

  it('IFF1 is true after warm-up when snapshot has IFF1=true (IM2 ISR called EI before RETI)', async () => {
    const emu = await makeEmu();

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs({ IFF1: true, IFF2: true })  // interrupts enabled
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'iff1test', autoStart: false });

    // EI sets IFF1=IFF2=true; RETI sets IFF1=IFF2 (still true)
    expect(emu.cpu.IFF1).toBe(true);
  });

  it('IFF1 is true after warm-up when snapshot had IFF1=false (ISR ran EI/RETI)', async () => {
    const emu = await makeEmu();

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()   // IFF1=false
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'iff1falseTest', autoStart: false });

    // IFF1 forced true for warm-up, ISR ran EI/RETI → IFF1 stays true
    expect(emu.cpu.IFF1).toBe(true);
  });

  it('PC returns to main loop after IM2 warm-up with IFF1=true (ISR completed via RETI)', async () => {
    const emu = await makeEmu();

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs({ IFF1: true, IFF2: true })
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'pctest', autoStart: false });

    // After RETI pops the saved PC (0x8000) and the JR $ loop runs for the
    // remainder of the frame, PC should still be in the 0x8000 area
    expect(emu.cpu.PC & 0xFFF0).toBe(0x8000);
  });

  it('warm-up with IFF1=false produces few memWrites (ISR serviced, matching reference)', async () => {
    const emu = await makeEmu();

    // Count value-changing memory writes during the warm-up frame.
    // The reference trace (jsspeccy3) shows only 2 value-changing memWrites in
    // frame 0.  With IFF1 forced=true the ISR fires, writes the marker, then
    // the JR $ loop produces no further writes.
    let changedWrites = 0;
    const origWrite = emu.memory.write.bind(emu.memory);
    emu.memory.write = function (addr, val, ...rest) {
      const prev = emu.memory.read(addr);
      const result = origWrite(addr, val, ...rest);
      if (val !== prev) changedWrites++;
      return result;
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()   // IFF1=false — forced true by warm-up path
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'memWriteTest', autoStart: false });

    // ISR writes 1 byte (flag) + ISR call pushes 2 bytes on stack = ≤10 total
    expect(changedWrites).toBeLessThanOrEqual(10);
    // IFF1 must be true after warm-up (ISR ran EI/RETI)
    expect(emu.cpu.IFF1).toBe(true);
    // After warm-up, tstates holds the small carry-over from the last
    // instruction that crossed the 69888 boundary (typically 0-10 cycles).
    expect(emu.cpu.tstates).toBeGreaterThanOrEqual(0);
    expect(emu.cpu.tstates).toBeLessThan(20);
  });

  it('T-states reset to 0 before warm-up when snapshot has no tstates field (frame-boundary path)', async () => {
    const emu = await makeEmu();

    // Artificially inflate tstates so we can verify the reset happens
    emu.cpu.tstates = 99999;

    let tstatesAtEntry = undefined;
    const origRun = emu._runCpuForFrame.bind(emu);
    emu._runCpuForFrame = function () {
      tstatesAtEntry = this.cpu ? this.cpu.tstates : undefined;
      return origRun();
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
        // no tstates property → defaults to 0 → frame-boundary path
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'tstatestest', autoStart: false });

    // tstates must have been reset to 0 before warm-up _runCpuForFrame call
    expect(tstatesAtEntry).toBe(0);
  });

  it('mid-frame snapshot: only remaining T-states run, intRequested cleared, IFF1 not clobbered', async () => {
    // Root-cause fix for Jetpac missing asteroids/fire/enemies:
    // The _mapZ80PagesToRam 48K page mapping (ID 8→0, 4→0x4000, 5→0x8000) was
    // shadowed by the has128Pages branch (IDs 4,5,8 are all in range 3-10).
    // Separately: the warmup must clear intRequested before runFor (to prevent
    // spurious interrupts when game hits EI), and ULA now asserts intRequested
    // unconditionally each frame so games in DI state at frame boundaries still
    // get their interrupt when they execute EI.
    const TSTATES_PER_FRAME = 69888;
    const SNAP_TSTATES = 17472; // 69888/4 — one quarter through the frame

    const emu = await makeEmu();

    // Artificially set stale intRequested to true before applySnapshot to
    // verify it is explicitly cleared by the mid-frame warmup path.
    emu.cpu.intRequested = true;

    // Track whether generateInterruptSync was called during applySnapshot warmup
    let generateInterruptCalledDuringWarmup = false;
    const origGen = emu.ula.generateInterruptSync.bind(emu.ula);
    emu.ula.generateInterruptSync = function (...args) {
      generateInterruptCalledDuringWarmup = true;
      return origGen(...args);
    };

    // Spy on cpu.runFor: capture count AND intRequested state at the moment of call
    let runForArg = undefined;
    let intRequestedAtRunForEntry = undefined;
    const origRunFor = emu.cpu.runFor.bind(emu.cpu);
    emu.cpu.runFor = function (n) {
      if (runForArg === undefined) {
        runForArg = n;
        intRequestedAtRunForEntry = emu.cpu.intRequested; // must be false (cleared)
      }
      return origRunFor(n);
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs(), // IFF1=false (snapshot inside ISR)
        tstates: SNAP_TSTATES  // v2/v3 header bytes 55-57 value
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'midFrameTest', autoStart: false });

    // 1. Warmup must run only the REMAINING T-states, not a full frame
    expect(runForArg).toBe(TSTATES_PER_FRAME - SNAP_TSTATES); // 52416

    // 2. intRequested must have been cleared BEFORE the warmup runFor call
    expect(intRequestedAtRunForEntry).toBe(false);

    // 3. generateInterruptSync must NOT be called during the mid-frame warmup
    //    (the interrupt is not due until the next frame boundary)
    expect(generateInterruptCalledDuringWarmup).toBe(false);

    // 4. IFF1 must not be clobbered — the snapshot's real value (false) is preserved
    expect(emu.cpu.IFF1).toBe(false);

    // 5. After warmup, cpu.tstates must be at/past the frame boundary
    expect(emu.cpu.tstates).toBeGreaterThanOrEqual(TSTATES_PER_FRAME);
    expect(emu.cpu.tstates).toBeLessThan(TSTATES_PER_FRAME + 20);
  });

  it('skipWarm bypasses the interrupt pre-queue entirely', async () => {
    const emu = await makeEmu();

    let intRequestedAtCallTime = undefined;
    const origRun = emu._runCpuForFrame.bind(emu);
    emu._runCpuForFrame = function () {
      intRequestedAtCallTime = this.cpu ? this.cpu.intRequested : undefined;
      return origRun();
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'skipwarmtest', autoStart: false, skipWarm: true });

    // _runCpuForFrame should never have been called with skipWarm=true
    expect(intRequestedAtCallTime).toBeUndefined();
  });

  it('normal frames queue interrupt at START of _runCpuForFrame (every frame, not just warm-up)', async () => {
    const emu = await makeEmu();

    // Load snapshot with the IM2 ISR so the warm-up succeeds cleanly
    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
      }
    };
    await emu.applySnapshot(parsed, { fileName: 'phasetest', autoStart: false });

    // Spy on cpu.runFor — it is called by _runCpuForFrame() immediately AFTER
    // generateInterruptSync().  Capturing intRequested at the top of that call
    // proves the interrupt was queued before the CPU executed anything.
    let intAtRunForEntry = undefined;
    const origRunFor = emu.cpu.runFor.bind(emu.cpu);
    emu.cpu.runFor = function (...args) {
      intAtRunForEntry = emu.cpu.intRequested;
      emu.cpu.runFor = origRunFor; // single-shot spy
      return origRunFor(...args);
    };

    // Trigger one normal (post-warm-up) frame directly
    emu._runCpuForFrame();

    // The interrupt must have been set BEFORE runFor() was called
    expect(intAtRunForEntry).toBe(true);
  });
});
