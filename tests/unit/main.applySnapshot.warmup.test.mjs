/* eslint-disable no-console */
/**
 * Tests for the post-load warm-up interrupt pre-queuing in applySnapshot().
 *
 * Root cause: jsspeccy3 (reference) fires the ULA maskable interrupt at the
 * START of each new raster frame; our _runCpuForFrame() fires it at the END.
 * Without the pre-queue shim, the warm-up frame runs with IFF1=false (as
 * stored in the raw .z80 file), no interrupt fires, and the CPU follows a
 * completely different code path — putting Jetpac's rocket/enemy sprite code
 * out of reach.
 *
 * Fix: _applySnapshot_warmupInterrupt() forces IFF1=true and calls
 * generateInterruptSync() before the warm-up runFor(), so cpu.intRequested=true
 * at the very first step() — matching jsspeccy3's frame-0 execution path.
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

describe('applySnapshot warm-up – interrupt pre-queuing', () => {
  it('pre-queues cpu.intRequested before _runCpuForFrame when IFF1=false in snapshot', async () => {
    const emu = await makeEmu();

    // Spy on _runCpuForFrame to capture cpu.intRequested at the moment it is called
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

    await emu.applySnapshot(parsed, { fileName: 'warmtest', autoStart: false });

    // intRequested must have been true at warm-up entry — the pre-queue worked
    expect(intRequestedAtCallTime).toBe(true);
  });

  it('IM2 RAM-resident ISR runs during warm-up (FLAG_ADDR written by ISR)', async () => {
    const emu = await makeEmu();

    // FLAG_ADDR starts as 0; ISR writes 0x42 to prove it executed
    expect(emu.memory.read(FLAG_ADDR)).toBe(0);

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'isrtest', autoStart: false });

    // ISR wrote 0x42 to FLAG_ADDR — proves the interrupt fired and ISR completed
    expect(emu.memory.read(FLAG_ADDR)).toBe(0x42);
  });

  it('IFF1 is true after warm-up (IM2 ISR called EI before RETI)', async () => {
    const emu = await makeEmu();

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'iff1test', autoStart: false });

    // EI sets IFF1=IFF2=true; RETI sets IFF1=IFF2 (still true)
    expect(emu.cpu.IFF1).toBe(true);
  });

  it('PC returns to main loop after IM2 warm-up (ISR completed via RETI)', async () => {
    const emu = await makeEmu();

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs()
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'pctest', autoStart: false });

    // After RETI pops the saved PC (0x8000) and the JR $ loop runs for the
    // remainder of the frame, PC should still be in the 0x8000 area
    expect(emu.cpu.PC & 0xFFF0).toBe(0x8000);
  });

  it('T-states reset to 0 before warm-up when snapshot has no tstates field', async () => {
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
        // no tstates property — should default to 0
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'tstatestest', autoStart: false });

    // tstates must have been reset to 0 (frame boundary) before warm-up
    expect(tstatesAtEntry).toBe(0);
  });

  it('warm-up uses parsed snapshot.tstates when provided (v2/v3 interrupt phase)', async () => {
    const emu = await makeEmu();

    const SNAP_TSTATES = 17472; // one T-state chunk (69888/4) — typical v2/v3 value

    let tstatesAtEntry = undefined;
    const origRun = emu._runCpuForFrame.bind(emu);
    emu._runCpuForFrame = function () {
      tstatesAtEntry = this.cpu ? this.cpu.tstates : undefined;
      return origRun();
    };

    const parsed = {
      snapshot: {
        ram: makeRamWithIm2Isr(),
        registers: im2Regs(),
        tstates: SNAP_TSTATES // simulates what parseZ80 now returns for v2/v3
      }
    };

    await emu.applySnapshot(parsed, { fileName: 'tstatesPhaseTest', autoStart: false });

    // Warm-up must start at the snapshot's T-state offset, not 0
    expect(tstatesAtEntry).toBe(SNAP_TSTATES);
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

  it('_applySnapshot_warmupInterrupt is a no-op when ULA is absent', async () => {
    const emu = await makeEmu();
    const origUla = emu.ula;
    emu.ula = null; // simulate missing ULA

    // Should not throw
    expect(() => emu._applySnapshot_warmupInterrupt()).not.toThrow();

    emu.ula = origUla; // restore
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
