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
    addEventListener: () => {},
    focus: vi.fn(),
    getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
      putImageData: () => {},
      fillRect: () => {},
      imageSmoothingEnabled: false,
    }),
    toDataURL: () => ''
  };
  return new (await import('../../src/main.mjs')).Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator._finalizeCoreStart (legacy behaviour)', () => {
  beforeEach(() => {
    // reset test-global
    try { window.__TEST__ = {}; } catch (e) { /* ignore */ }
  });
  afterEach(() => { vi.useRealTimers(); });

  it('calls input.start and attaches canvas key forwarding when canvas present', async () => {
    const emu = await makeEmu();

    // stub input.start and capture addEventListener calls
    emu.input.start = vi.fn();
    const events = [];
    emu.canvas.addEventListener = (name, cb, opts) => events.push({ name, cb, opts });

    emu._finalizeCoreStart(null);

    expect(emu.input.start).toHaveBeenCalled();
    // canvas listeners should be attached for keydown/keyup
    const names = events.map(e => e.name).sort();
    expect(names).toEqual(['keydown', 'keyup']);
    // window.__TEST__ should note the canvas listener registration
    expect(window.__TEST__ && window.__TEST__.inputListeners && window.__TEST__.inputListeners.canvas).toBe(true);
  });

  it('copies romBuffer when provided and does not keep a reference to original', async () => {
    const emu = await makeEmu();

    const src = new Uint8Array([1, 2, 3, 4]);
    emu._finalizeCoreStart(src);

    expect(emu.romBuffer).toBeDefined();
    expect(emu.romBuffer).not.toBe(src); // copy must be created
    expect(Array.from(emu.romBuffer.slice ? emu.romBuffer : new Uint8Array(emu.romBuffer))).toEqual([1, 2, 3, 4]);

    // mutating original must not change stored romBuffer
    src[0] = 99;
    expect(emu.romBuffer[0]).toBe(1);
  });

  it('defers focus via setTimeout and marks window.__TEST__.canvasFocused', async () => {
    const emu = await makeEmu();
    vi.useFakeTimers();

    // ensure canvas.focus is a spy
    emu.canvas.focus = vi.fn();

    emu._finalizeCoreStart(null);

    // not called synchronously
    expect(emu.canvas.focus).not.toHaveBeenCalled();

    // run pending timers
    vi.runAllTimers();

    expect(emu.canvas.focus).toHaveBeenCalled();
    expect(window.__TEST__ && window.__TEST__.canvasFocused).toBe(true);
  });
});
