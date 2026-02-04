// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initKeywordUI } from '../src/ui-keyword.mjs';

describe('UI Keyword helper', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    try { vi.useRealTimers(); } catch (e) {}
    if (window.__EMU_UI__ && window.__EMU_UI__._el) {
      try { window.__EMU_UI__._el.remove(); } catch (e) {}
      delete window.__EMU_UI__;
    }
  });

  it('shows and auto-hides keyword', async () => {
    vi.useFakeTimers();
    const ui = initKeywordUI();
    expect(ui).toBeTruthy();
    ui.showKeyword('LIST', { timeout: 500 });

    const el = document.getElementById('__emu_keyword');
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('LIST');
    // display is set to block immediately
    expect(el.style.display).toBe('block');
    // After timeout it should hide
    vi.advanceTimersByTime(600);
    // run microtasks/timeouts
    await Promise.resolve();
    expect(el.getAttribute('aria-hidden')).toBe('true');

    vi.useRealTimers();
  });
});