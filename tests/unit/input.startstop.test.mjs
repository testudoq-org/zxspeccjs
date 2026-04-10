/* eslint-env node */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Input from '../../src/input.mjs';

describe('Input.start / stop (unit)', () => {
  let input;
  let fakeCanvas;

  beforeEach(() => {
    input = new Input();

    // Minimal DOM/window stubs for start()/stop
    fakeCanvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const fakeDocument = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getElementById: (id) => (id === 'screen' ? fakeCanvas : null),
      createElement: (tag) => ({ id: '__emu_hidden_input', addEventListener: vi.fn(), removeEventListener: vi.fn(), style: {}, parentNode: { removeChild: vi.fn() } }),
      body: { appendChild: vi.fn() },
    };
    const fakeWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn(), __TEST__: {} };

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches listeners and creates hidden input on start', () => {
    input.start();

    expect(window.addEventListener).toHaveBeenCalled();
    expect(document.addEventListener).toHaveBeenCalled();
    expect(fakeCanvas.addEventListener).toHaveBeenCalled();
    expect(input._hiddenInput).not.toBeNull();

    expect(window.__TEST__.inputListeners.window).toBe(true);
    expect(window.__TEST__.inputListeners.document).toBe(true);
    expect(window.__TEST__.inputListeners.canvas).toBe(true);
  });

  it('removes listeners and hidden input on stop', () => {
    input.start();
    input.stop();

    expect(window.removeEventListener).toHaveBeenCalled();
    expect(document.removeEventListener).toHaveBeenCalled();
    expect(fakeCanvas.removeEventListener).toHaveBeenCalled();
    expect(input._hiddenInput).toBeNull();

    expect(window.__TEST__.inputListeners.window).toBe(false);
    expect(window.__TEST__.inputListeners.document).toBe(false);
    expect(window.__TEST__.inputListeners.canvas).toBe(false);
  });
});
