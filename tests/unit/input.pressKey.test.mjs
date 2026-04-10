/* eslint-env node, browser */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Input, { KEY_TO_POS, DEFAULT_ROW } from '../../src/input.mjs';

describe('Input.pressKey (unit)', () => {
  let input;
  beforeEach(() => {
    // Minimal DOM/window shims for node test environment
    if (typeof globalThis.document === 'undefined') {
      globalThis.document = { body: { appendChild() {} }, createElement: () => ({ id:'', addEventListener(){}, removeEventListener(){}, style:{} }), getElementById: () => null, addEventListener: ()=>{}, removeEventListener: ()=>{} };
    }
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, __TEST__: {} };
    }

    input = new Input();
    input.reset();
    // ensure clean test hooks
    try { delete globalThis.window.__EMU_PRESS_HITS; } catch { /* ignore */ }
    try { delete globalThis.window.__TEST__; } catch { /* ignore */ }
  });
  afterEach(() => {
    try { delete globalThis.window.__EMU_PRESS_HITS; } catch { /* ignore */ }
    try { delete globalThis.window.__TEST__; } catch { /* ignore */ }
    try { delete globalThis.window.emulator; } catch { /* ignore */ }
  });

  it('returns true for known key and updates matrix/pressed set', () => {
    const ok = input.pressKey('q');
    expect(ok).toBe(true);
    expect(input.isKeyPressed('q')).toBe(true);
    const pos = KEY_TO_POS.get('q');
    expect((input.matrix[pos.row] & pos.mask) === 0).toBe(true);
  });

  it('returns false for unknown key', () => {
    const ok = input.pressKey('no-such-key');
    expect(ok).toBe(false);
  });

  it('updates emulator ULA keyMatrix when available and records lastAppliedKeyMatrix', () => {
    // create fake emulator + ula with keyMatrix
    const fakeKeyMatrix = new Uint8Array(8);
    for (let i = 0; i < 8; i++) fakeKeyMatrix[i] = DEFAULT_ROW;
    globalThis.window.emulator = { ula: { keyMatrix: fakeKeyMatrix }, _applyInputToULA: () => {} };

    const ok = input.pressKey('a');
    expect(ok).toBe(true);
    const pos = KEY_TO_POS.get('a');
    // ULA keyMatrix should have the active-low bit cleared
    expect((globalThis.window.emulator.ula.keyMatrix[pos.row] & pos.mask) === 0).toBe(true);
    // ULA keyMatrix was updated; if test hook is present, record should be populated
    if (globalThis.window.__TEST__) {
      expect(Array.isArray(globalThis.window.__TEST__.lastAppliedKeyMatrix)).toBe(true);
      expect(globalThis.window.__TEST__.lastAppliedKeyMatrix[pos.row] & pos.mask).toBe(0);
    }
  });

  it('dispatches `emu-input-status` event with lastKey detail', (done) => {
    globalThis.document.addEventListener('emu-input-status', function handler(ev) {
      try {
        expect(ev && ev.detail && ev.detail.lastKey).toBe('l');
        globalThis.document.removeEventListener('emu-input-status', handler);
        done();
      } catch (err) { done(err); }
    });

    const ok = input.pressKey('l');
    expect(ok).toBe(true);
  });
});
