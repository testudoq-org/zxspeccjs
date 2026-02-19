import { describe, it, expect, vi } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, focus: vi.fn(), getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator.applySnapshot - peripherals & resume', () => {
  it('restores ULA border and calls _updateCanvasBorder when provided', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // Provide a fake ULA with updateCanvasBorder spy
    emu.ula = { border: 0, _updateCanvasBorder: vi.fn() };

    const parsed = { snapshot: { registers: { borderColor: 0x05 } } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'periph', autoStart: false });
    expect(ok).toBe(true);
    expect(emu.ula.border).toBe(0x05 & 0x07);
    expect(emu.ula._updateCanvasBorder).toHaveBeenCalled();
  });

  it('calls input.start during applySnapshot', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.input.start = vi.fn();

    const parsed = { snapshot: { ram: new Uint8Array(0x400) } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'input', autoStart: false });
    expect(ok).toBe(true);
    expect(emu.input.start).toHaveBeenCalled();
  });

  it('resumes audio context when suspended', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // stub sound.ctx.resume
    emu.sound = { ctx: { state: 'suspended', resume: vi.fn(() => Promise.resolve()) } };

    const parsed = { snapshot: { ram: new Uint8Array(0x100) } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'audio', autoStart: false });
    expect(ok).toBe(true);
    expect(emu.sound.ctx.resume).toHaveBeenCalled();
  });

  it('honors autoStart flag: start() called when autoStart=true and not called when false', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.start = vi.fn();

    const parsed = { snapshot: { ram: new Uint8Array(0x100) } };
    await emu.applySnapshot(parsed, { fileName: 'as-true', autoStart: true });
    expect(emu.start).toHaveBeenCalled();

    emu.start.mockClear();
    await emu.applySnapshot(parsed, { fileName: 'as-false', autoStart: false });
    expect(emu.start).not.toHaveBeenCalled();
  });

  it('focuses canvas for keyboard input', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.canvas.focus = vi.fn();

    const parsed = { snapshot: { ram: new Uint8Array(0x100) } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'focus', autoStart: false });
    expect(ok).toBe(true);
    expect(emu.canvas.focus).toHaveBeenCalled();
  });

  // --- helper-level tests ---
  it('restoreBorder helper updates ULA border and calls update', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.ula = { border: 0, _updateCanvasBorder: vi.fn() };
    emu._applySnapshot_restoreBorder({ snapshot: { registers: { borderColor: 0x06 } } });
    expect(emu.ula.border).toBe(0x06 & 0x07);
    expect(emu.ula._updateCanvasBorder).toHaveBeenCalled();
  });

  it('initializeInput helper calls input.start', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.input.start = vi.fn();
    emu._applySnapshot_initializeInput();
    expect(emu.input.start).toHaveBeenCalled();
  });

  it('resumeAudioIfNeeded helper resumes suspended audio context', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.sound = { ctx: { state: 'suspended', resume: vi.fn(() => Promise.resolve()) } };
    await emu._applySnapshot_resumeAudioIfNeeded();
    expect(emu.sound.ctx.resume).toHaveBeenCalled();
  });

  it('focusCanvas helper calls canvas.focus', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.canvas.focus = vi.fn();
    emu._applySnapshot_focusCanvas();
    expect(emu.canvas.focus).toHaveBeenCalled();
  });

  it('maybeAutoStart helper calls start when requested', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    emu.start = vi.fn();
    emu._applySnapshot_maybeAutoStart(true);
    expect(emu.start).toHaveBeenCalled();

    emu.start.mockClear();
    emu._applySnapshot_maybeAutoStart(false);
    expect(emu.start).not.toHaveBeenCalled();
  });
});
