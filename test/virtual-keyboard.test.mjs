// @unit
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Input from '../src/input.mjs';

describe('Virtual keyboard integration (unit) @unit', () => {
  let input;

  beforeEach(() => {
    // Minimal DOM/host shims for Node environment where JSDOM is not installed
    const origDoc = typeof document !== 'undefined' ? document : undefined;
    if (typeof global.document === 'undefined') {
      global.localStorage = { getItem: () => null, setItem: () => {} };
      global.document = (function(){
        const els = new Map();
        const make = (tag) => {
          const obj = {
            tagName: tag.toUpperCase(),
            style: {},
            dataset: {},
            value: '',
            id: '',
            _listeners: {},
            setSelectionRange() {},
            setAttribute(k,v){ this[k]=v; },
            addEventListener(type, fn){ this._listeners[type] = this._listeners[type] || []; this._listeners[type].push(fn); },
            removeEventListener(type, fn){ /* noop */ },
            dispatchEvent(e){ (this._listeners[e.type]||[]).forEach(fn=>fn.call(this,e)); },
            focus(){ global.document.activeElement = this; },
            blur(){ if (global.document.activeElement === this) global.document.activeElement = null; }
          };
          return obj;
        };
        const body = { appendChild(el){ if (el && el.id) els.set(el.id, el); }, removeChild(el){ if (el && el.id) els.delete(el.id); } };
        return {
          body,
          createElement(tag){ return make(tag); },
          getElementById(id){ return els.get(id) || null; },
          querySelector(sel){ if (sel === 'body') return body; if (sel && sel.startsWith('#')) return els.get(sel.slice(1)) || null; return null; },
          activeElement: null
        };
      })();
      // ensure app container exists
      const app = document.createElement('div'); app.id = 'app'; document.body.appendChild(app);
      global.__savedDocumentForTests = origDoc;
    } else {
      // reset existing document body if present
      try { const app = document.getElementById('app') || document.createElement('div'); app.id = 'app'; if (!document.getElementById('app')) document.body.appendChild(app); } catch { /* ignore */ }
    }

    input = new Input();
    input.start();
    input.createVirtualKeyboard('#app');
  });

  afterEach(() => {
    try { input.stop(); } catch (e) { /* ignore */ }
    try { document.body.innerHTML = ''; } catch (e) { /* ignore */ }
    try { vi.useRealTimers(); } catch (e) { /* ignore */ }
    if (global.__savedDocumentForTests !== undefined) {
      global.document = global.__savedDocumentForTests;
      delete global.__savedDocumentForTests;
    }
  });

  it('pointerdown/pointerup updates matrix and focuses hidden input @unit', () => {
    const btn = document.querySelector('.zxvk-overlay button[data-key="q"]');
    expect(btn).toBeTruthy();

    const hidden = document.getElementById('__emu_hidden_input');
    expect(hidden).toBeTruthy();

    btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(input.isKeyPressed('q')).toBe(true);
    // hidden input should be focused during press
    expect(document.activeElement).toBe(hidden);

    btn.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(input.isKeyPressed('q')).toBe(false);
    expect(document.activeElement).not.toBe(hidden);
  });

  it('input event on hidden input maps character to press/release @unit', async () => {
    vi.useFakeTimers();
    const hidden = document.getElementById('__emu_hidden_input');
    expect(hidden).toBeTruthy();

    // simulate typing 'a' (last char 'a')
    hidden.value = 'a';
    hidden.dispatchEvent(new Event('input', { bubbles: true }));

    // immediately pressed
    expect(input.isKeyPressed('a')).toBe(true);

    // advance timers to allow auto-release
    vi.advanceTimersByTime(100);
    expect(input.isKeyPressed('a')).toBe(false);

    vi.useRealTimers();
  });
});