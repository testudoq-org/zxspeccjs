import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = {
    width: 320,
    height: 240,
    style: {},
    getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
      putImageData: () => {},
      fillRect: () => {},
      imageSmoothingEnabled: false,
    }),
    toDataURL: () => ''
  };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator frame processing helpers', () => {
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('_runCpuForFrame calls cpu.runFor and invokes ULA interrupt handlers', () => {
    return (async () => {
      const emu = await makeEmu();

      const fakeCpu = { tstates: 12345, runFor: vi.fn((n) => { fakeCpu.tstates += n; }) };
      emu.cpu = fakeCpu;
      emu.ula = { updateInterruptState: vi.fn(), generateInterruptSync: vi.fn() };

      // run frame
      emu._runCpuForFrame();

      // frameStartTstates recorded, runFor called with expected frame t-states
      expect(fakeCpu.frameStartTstates).toBe(12345);
      expect(fakeCpu.runFor).toHaveBeenCalledWith(69888);

      // ULA interrupt helpers called
      expect(emu.ula.updateInterruptState).toHaveBeenCalled();
      expect(emu.ula.generateInterruptSync).toHaveBeenCalled();
    })();
  });

  it('_handleBootOrRender renders during boot when display writes are observed and decrements boot frame counter', async () => {
    const emu = await makeEmu();

    // Prepare state to simulate boot-time display writes
    emu._bootFramesRemaining = 2;
    emu._memWrites = [{ addr: 0x4000, value: 0x12 }];
    emu._lastMemWritesLen = 0;

    emu.ula = { render: vi.fn() };

    emu._handleBootOrRender();

    // Should have rendered and decremented boot frame counter
    expect(emu.ula.render).toHaveBeenCalled();
    expect(emu._bootFramesRemaining).toBe(1);
    // lastMemWritesLen should be updated to current memWrites length
    expect(emu._lastMemWritesLen).toBe(emu._memWrites.length);
  });

  it('_checkCharsAndScheduleRenders updates _lastChars and schedules glyph checks that call ULA.render when bytes are populated', async () => {
    const emu = await makeEmu();

    // fake ULA to observe render calls
    emu.ula = { render: vi.fn() };

    // Choose a chars pointer and return a populated glyph for the check
    const ptr = 0x3C00;
    const lo = ptr & 0xff;
    const hi = (ptr >> 8) & 0xff;
    const glyphBase = (ptr + 0x7F * 8) & 0xffff; // address read by checkGlyph

    // Provide a fake memory.read that returns hi/lo for 0x5C36/0x5C37 and
    // returns a non-zero byte for one of the glyph bytes so populated === true
    emu.memory = {
      read: (addr) => {
        if (addr === 0x5C36) return lo;
        if (addr === 0x5C37) return hi;
        if (addr >= glyphBase && addr < (glyphBase + 8)) return 0xFF; // populated
        return 0;
      }
    };

    // Ensure _lastChars differs so code takes the 'changed' path
    emu._lastChars = 0x0000;

    // Use fake timers to execute the scheduled delayed checks immediately
    vi.useFakeTimers();

    emu._checkCharsAndScheduleRenders();

    // _lastChars should be updated synchronously
    const expectedChars = (hi << 8) | lo;
    expect(emu._lastChars).toBe(expectedChars);

    // Advance timers to run the scheduled checkGlyph callbacks (last delay 500ms)
    vi.advanceTimersByTime(600);

    // Expect ULA.render to have been called by the scheduled check
    expect(emu.ula.render).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
