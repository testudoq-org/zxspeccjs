import { describe, it, expect, vi } from 'vitest';

// Minimal DOM shims so importing `src/main.mjs` is safe under Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {}, imageSmoothingEnabled: false }), toDataURL: () => '' };
  return new Emulator({ canvas: canvasStub, statusEl: {} });
}

describe('Emulator.applySnapshot - RAM restore', () => {
  it('applies full 48K RAM snapshot into pages[1..3]', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const ram = new Uint8Array(0xC000);
    for (let i = 0; i < ram.length; i++) ram[i] = (i & 0xff);

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'full', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // verify page1/page2/page3 were written from ram subarrays
    expect(emu.memory.pages[1][0]).toBe(ram[0]);
    expect(emu.memory.pages[2][0]).toBe(ram[0x4000]);
    expect(emu.memory.pages[3][0]).toBe(ram[0x8000]);
    // spot check an internal value
    expect(emu.memory.pages[2][0x123]).toBe(ram[0x4000 + 0x123]);
  });

  it('applies partial RAM snapshot sequentially into pages', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const partialLen = 0x5000; // spans page1 fully and part of page2
    const ram = new Uint8Array(partialLen);
    for (let i = 0; i < ram.length; i++) ram[i] = (0x80 + (i & 0x7f));

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'partial', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // page1 filled completely
    expect(emu.memory.pages[1][0x0]).toBe(ram[0]);
    expect(emu.memory.pages[1][0x3fff]).toBe(ram[0x3fff]);
    // page2 first byte should equal ram[0x4000]
    expect(emu.memory.pages[2][0x0]).toBe(ram[0x4000]);
    // bytes beyond provided length should remain unchanged (default 0)
    expect(emu.memory.pages[2][0x1000]).toBe(0);
  });

  it('calls _syncFlatRamFromBanks when _flatRam is present', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // set marker and spy
    emu.memory._flatRam = true;
    emu.memory._syncFlatRamFromBanks = vi.fn();

    const ram = new Uint8Array(0x4000);
    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'flat', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);
    expect(emu.memory._syncFlatRamFromBanks).toHaveBeenCalled();
  });

  it('updates FrameBuffer immediately after snapshot apply (deferred rendering)', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    // Build a minimal 48K RAM snapshot and inject a visible marker
    const ram = new Uint8Array(0xC000);
    // Choose ZX pixel coordinate and compute bitmap/attr offsets
    const MARKER_X = 120; const MARKER_Y = 80;
    const xByte = MARKER_X >> 3;
    const bitmapIdx = ((MARKER_Y & 0xC0) << 5) | ((MARKER_Y & 0x07) << 8) | ((MARKER_Y & 0x38) << 2) | xByte;
    const attrIdx = 6144 + (Math.floor(MARKER_Y / 8) * 32) + xByte;
    ram[bitmapIdx] = 0xFF;           // solid 8 pixels
    ram[attrIdx] = 0x47;             // bright white ink

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'marker', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // FrameBuffer should have been updated by applySnapshot() (deferred path)
    expect(emu.memory.pages[1][bitmapIdx]).toBe(0xFF);

    // Compute frameBuffer buffer offsets and assert bytes present
    const FB_BASE = 24 * 160;
    // main-screen line stride in framebuffer (bytes per line in main area)
    const LINE_STRIDE = 96;
    const lineOffset = FB_BASE + MARKER_Y * LINE_STRIDE;
    const cellStart = lineOffset + 16 + xByte * 2; // bitmap byte then attr byte
    const fb = emu.ula.frameBuffer.getBuffer();
    expect(fb[cellStart]).toBe(0xFF);
    expect(fb[cellStart + 1]).toBe(0x47);
  });

  // TDD regression: ensure applySnapshot does not rely on fallback manual copy
  it('does not set _applySnapshotFallbackUsed when generator updated buffer', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const MARKER_X = 120; const MARKER_Y = 80;
    const xByte = MARKER_X >> 3;
    const ram = new Uint8Array(0xC000);
    const bitmapIdx = ((MARKER_Y & 0xC0) << 5) | ((MARKER_Y & 0x07) << 8) | ((MARKER_Y & 0x38) << 2) | xByte;
    const attrIdx = 6144 + (Math.floor(MARKER_Y / 8) * 32) + xByte;
    ram[bitmapIdx] = 0xFF;
    ram[attrIdx] = 0x47;

    const parsed = { snapshot: { ram } };

    // Ensure fallback is enabled (default) so we detect if it's ever used
    delete emu._disableApplySnapshotFallback;

    const ok = await emu.applySnapshot(parsed, { fileName: 'regression', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // The frame buffer must match memory
    const FB_BASE = 24 * 160;
    const LINE_STRIDE = 96;
    const lineOffset = FB_BASE + MARKER_Y * LINE_STRIDE;
    const cellStart = lineOffset + 16 + xByte * 2;
    const fb = emu.ula.frameBuffer.getBuffer();

    expect(fb[cellStart]).toBe(0xFF);
    expect(fb[cellStart + 1]).toBe(0x47);

    // Regression assertion: fallback path MUST NOT have been executed
    expect(!!emu._applySnapshotFallbackUsed).toBe(false);
  });

  it('does not trigger applySnapshot fallback copy (regression - disabled flag)', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const MARKER_X = 120; const MARKER_Y = 80;
    const xByte = MARKER_X >> 3;
    const ram = new Uint8Array(0xC000);
    const bitmapIdx = ((MARKER_Y & 0xC0) << 5) | ((MARKER_Y & 0x07) << 8) | ((MARKER_Y & 0x38) << 2) | xByte;
    const attrIdx = 6144 + (Math.floor(MARKER_Y / 8) * 32) + xByte;
    ram[bitmapIdx] = 0xFF;
    ram[attrIdx] = 0x47;

    const parsed = { snapshot: { ram } };

    // Test toggle: tell applySnapshot to skip fallback if implemented
    emu._disableApplySnapshotFallback = true;

    const ok = await emu.applySnapshot(parsed, { fileName: 'no-fallback', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // The frame buffer must match memory immediately even when the fallback is disabled
    const FB_BASE = 24 * 160;
    const LINE_STRIDE = 96;
    const lineOffset = FB_BASE + MARKER_Y * LINE_STRIDE;
    const cellStart = lineOffset + 16 + xByte * 2;
    const fb = emu.ula.frameBuffer.getBuffer();

    expect(fb[cellStart]).toBe(0xFF);
    expect(fb[cellStart + 1]).toBe(0x47);
  });

  it('records applySnapshot timing trace and renderer duration', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const ram = new Uint8Array(0xC000);
    const MARKER_X = 120; const MARKER_Y = 80;
    const xByte = MARKER_X >> 3;
    const bitmapIdx = ((MARKER_Y & 0xC0) << 5) | ((MARKER_Y & 0x07) << 8) | ((MARKER_Y & 0x38) << 2) | xByte;
    const attrIdx = 6144 + (Math.floor(MARKER_Y / 8) * 32) + xByte;
    ram[bitmapIdx] = 0xFF;           // solid 8 pixels
    ram[attrIdx] = 0x47;             // bright white ink

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'timing', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    // trace recorded and ordered
    expect(Array.isArray(emu._applySnapshotTrace)).toBe(true);
    const steps = emu._applySnapshotTrace.map(e => e.step);
    expect(steps[0]).toBe('applySnapshot:start');
    expect(steps).toContain('fb.generateFromMemory:start');
    expect(steps).toContain('frameRenderer.render:start');
    expect(steps[steps.length - 1]).toBe('applySnapshot:end');

    const fbIdx = steps.indexOf('fb.generateFromMemory:start');
    const renderIdx = steps.indexOf('frameRenderer.render:start');
    expect(fbIdx).toBeGreaterThan(0);
    expect(renderIdx).toBeGreaterThan(fbIdx);

    // renderer duration was recorded on the renderer instance
    expect(typeof emu.ula.frameRenderer._lastRenderDuration).toBe('number');
    expect(emu.ula.frameRenderer._lastRenderDuration).toBeGreaterThanOrEqual(0);
  });

  it('generateFromMemory is applied before render and framebuffer matches memory immediately', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);

    const ram = new Uint8Array(0xC000);
    const MARKER_X = 120; const MARKER_Y = 80;
    const xByte = MARKER_X >> 3;
    const bitmapIdx = ((MARKER_Y & 0xC0) << 5) | ((MARKER_Y & 0x07) << 8) | ((MARKER_Y & 0x38) << 2) | xByte;
    const attrIdx = 6144 + (Math.floor(MARKER_Y / 8) * 32) + xByte;
    ram[bitmapIdx] = 0xFF;           // solid 8 pixels
    ram[attrIdx] = 0x47;             // bright white ink

    const parsed = { snapshot: { ram } };
    const ok = await emu.applySnapshot(parsed, { fileName: 'timing-2', autoStart: false, skipWarm: true });
    expect(ok).toBe(true);

    const FB_BASE = 24 * 160;
    const LINE_STRIDE = 96;
    const lineOffset = FB_BASE + MARKER_Y * LINE_STRIDE;
    const cellStart = lineOffset + 16 + xByte * 2;
    const fb = emu.ula.frameBuffer.getBuffer();
    expect(fb[cellStart]).toBe(0xFF);
    expect(fb[cellStart + 1]).toBe(0x47);
  });
});
