// src/input.mjs
// ZX Spectrum 48K keyboard input module (ES6)

// ZX Spectrum 48K Keyboard Matrix Layout (8 rows × 5 columns)
// Each row is read when corresponding address line A8-A15 is LOW
// Each column corresponds to data bits D0-D4 (active low: 0 = pressed, 1 = released)
//
// ZX Spectrum 48K Hardware Layout (matches jsspeccy3 reference):
// Row 0 (A8=0, 0xFEFE): Caps Shift, Z, X, C, V   (D0-D4)
// Row 1 (A9=0, 0xFDFE): A, S, D, F, G            (D0-D4)
// Row 2 (A10=0, 0xFBFE): Q, W, E, R, T           (D0-D4)
// Row 3 (A11=0, 0xF7FE): 1, 2, 3, 4, 5           (D0-D4)
// Row 4 (A12=0, 0xEFFE): 0, 9, 8, 7, 6           (D0-D4)
// Row 5 (A13=0, 0xDFFE): P, O, I, U, Y           (D0-D4)
// Row 6 (A14=0, 0xBFFE): Enter, L, K, J, H       (D0-D4)
// Row 7 (A15=0, 0x7FFE): Space, Symbol Shift, M, N, B (D0-D4)

const DEFAULT_ROW = 0b11111; // 5 bits, all 1 = no key pressed

// ZX Spectrum 48K keyboard matrix layout (matches jsspeccy3 reference)
// Each row contains keys from D0 (bit 0) to D4 (bit 4)
const ROW_KEYS = [
  ['shift', 'z', 'x', 'c', 'v'],       // Row 0: A8=0 (Caps Shift)
  ['a', 's', 'd', 'f', 'g'],           // Row 1: A9=0
  ['q', 'w', 'e', 'r', 't'],           // Row 2: A10=0
  ['1', '2', '3', '4', '5'],           // Row 3: A11=0
  ['0', '9', '8', '7', '6'],           // Row 4: A12=0
  ['p', 'o', 'i', 'u', 'y'],           // Row 5: A13=0
  ['enter', 'l', 'k', 'j', 'h'],       // Row 6: A14=0
  ['space', 'symshift', 'm', 'n', 'b'] // Row 7: A15=0 (Symbol Shift)
];

// Build mapping from key name to (row, bitMask)
const KEY_TO_POS = new Map();
for (let r = 0; r < ROW_KEYS.length; r++) {
  for (let b = 0; b < ROW_KEYS[r].length; b++) {
    KEY_TO_POS.set(ROW_KEYS[r][b].toLowerCase(), { row: r, mask: 1 << b });
  }
}

// Common browser key code -> ZX Spectrum key name mapping
const CODE_TO_KEYNAME = Object.assign(Object.create(null), {
  // Letters (map to lowercase)
  KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e',
  KeyF: 'f', KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j',
  KeyK: 'k', KeyL: 'l', KeyM: 'm', KeyN: 'n', KeyO: 'o',
  KeyP: 'p', KeyQ: 'q', KeyR: 'r', KeyS: 's', KeyT: 't',
  KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x', KeyY: 'y',
  KeyZ: 'z',
  // Numbers
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  // Special keys
  Enter: 'enter', 
  Space: 'space', 
  ShiftLeft: 'shift', 
  ShiftRight: 'shift',
  ControlLeft: 'symshift',
  ControlRight: 'symshift',
  AltLeft: 'symshift',
  AltRight: 'symshift',
  // Fallbacks for some layouts
  Backquote: 'symshift',
  Quote: 'symshift',
  // Backspace maps to Caps Shift + 0 (DELETE on ZX Spectrum)
  Backspace: null // Special handling needed - see _keydown
});

// Special key combinations for PC keyboard convenience
const SPECIAL_COMBOS = {
  'Backspace': ['shift', '0'],  // DELETE = Caps Shift + 0
};

export default class Input {
  constructor() {
    // Each row is stored as 5-bit value (1 = released, 0 = pressed)
    // This matches ZX Spectrum's active-low convention
    this.matrix = new Uint8Array(8);
    for (let i = 0; i < 8; i++) this.matrix[i] = DEFAULT_ROW;

    // Track pressed keys by normalized name
    this.pressed = new Set();
    
    // Track special combo keys separately
    this.comboPressed = new Set();

    // Event handlers bound so they can be removed
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    
    // Debug logging flag
    this._debug = false;

    // Optionally created overlay element
    this.overlay = null;

    // Track key codes seen to handle cases where the same physical key produces
    // different characters while held (e.g., semicolon -> colon when shift is pressed)
    this._seenKeyCodes = new Map();

    // Hidden input to capture IME / mobile soft-keyboard events (best-effort)
    this._hiddenInput = null;
    this._onHiddenInput = null;
    this._onCompositionStart = null;
    this._onCompositionEnd = null;

    // Clear seenKeyCodes on stop for clean state
    this._seenKeyCodes = new Map();
  }

  // Enable/disable debug logging
  setDebug(enabled) {
    this._debug = enabled;
  }

  start() {
    window.addEventListener('keydown', this._keydown, { passive: false });
    window.addEventListener('keyup', this._keyup, { passive: false });
    // Also listen on document in capture phase to catch events from embedded contexts
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('keydown', this._keydown, { passive: false, capture: true });
        document.addEventListener('keyup', this._keyup, { passive: false, capture: true });
      }
    } catch (e) { /* ignore */ }

    // Attach canvas-level listeners so canvas can receive and forward keyboard events reliably
    try {
      const canvas = (typeof document !== 'undefined') ? document.getElementById('screen') : null;
      if (canvas) {
        canvas.addEventListener('keydown', this._keydown, { passive: false, capture: true });
        canvas.addEventListener('keyup', this._keyup, { passive: false, capture: true });
        try { if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__.inputListeners = window.__TEST__.inputListeners || {}; window.__TEST__.inputListeners.canvas = true; } catch(e){}
      }
    } catch (e) { /* ignore */ }

    // Emit listener status into test hook so E2E can assert they are attached
    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.inputListeners = window.__TEST__.inputListeners || {};
        window.__TEST__.inputListeners.window = true;
        window.__TEST__.inputListeners.document = true;
      }
    } catch (e) { /* ignore */ }

    // Ensure hidden input exists to capture IME / soft-keyboard events (best-effort)
    try { this._ensureHiddenInput(); } catch (e) { /* ignore */ }

    if (this._debug) console.log('[Input] Keyboard listeners started');
  }

  stop() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    try {
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('keydown', this._keydown, { capture: true });
        document.removeEventListener('keyup', this._keyup, { capture: true });
      }
    } catch (e) { /* ignore */ }

    // Remove canvas-level listeners
    try {
      const canvas = (typeof document !== 'undefined') ? document.getElementById('screen') : null;
      if (canvas) {
        canvas.removeEventListener('keydown', this._keydown, { capture: true });
        canvas.removeEventListener('keyup', this._keyup, { capture: true });
        try { if (typeof window !== 'undefined' && window.__TEST__ && window.__TEST__.inputListeners) window.__TEST__.inputListeners.canvas = false; } catch(e){}
      }
    } catch (e) { /* ignore */ }

    // Remove hidden input and its listeners (best-effort)
    try {
      if (this._hiddenInput) {
        try { this._hiddenInput.removeEventListener('input', this._onHiddenInput); } catch(e){}
        try { this._hiddenInput.removeEventListener('compositionstart', this._onCompositionStart); } catch(e){}
        try { this._hiddenInput.removeEventListener('compositionend', this._onCompositionEnd); } catch(e){}
        try { if (this._hiddenInput.parentNode) this._hiddenInput.parentNode.removeChild(this._hiddenInput); } catch(e){}
      }
    } catch (e) { /* ignore */ }

    this._hiddenInput = null;
    this._onHiddenInput = null;
    this._onCompositionStart = null;
    this._onCompositionEnd = null;

    // Update test hook to reflect removed listeners
    try {
      if (typeof window !== 'undefined' && window.__TEST__ && window.__TEST__.inputListeners) {
        window.__TEST__.inputListeners.window = false;
        window.__TEST__.inputListeners.document = false;
      }
    } catch (e) { /* ignore */ }

    if (this._debug) console.log('[Input] Keyboard listeners stopped');
  }

  // Reset all keys to released state
  reset() {
    for (let i = 0; i < 8; i++) this.matrix[i] = DEFAULT_ROW;
    this.pressed.clear();
    this.comboPressed.clear();
    if (this._debug) console.log('[Input] Keyboard matrix reset');
  }

  // Punctuation -> ZX key mapping for characters that map to spectrum keys via symbol-shift.
  // This is a small subset used for correct seenKeyCodes behavior in tests and IME cases.
  // Based on jsspeccy3 mappings (";" -> O, ":" -> Z, "," -> N, ">" -> T, etc.)
  _normalizeEvent(e) {
    // If a printable single-character key maps to a known ZX key, prefer that mapping
    const ch = ('' + (e.key || ''));
    const PUNCT_MAP = Object.create(null);
    PUNCT_MAP[';'] = 'o'; // semicolon -> O (symbol shifted in jsspeccy3)
    PUNCT_MAP[':'] = 'z';
    PUNCT_MAP[','] = 'n';
    PUNCT_MAP['<'] = 'r';
    PUNCT_MAP['.'] = 'm';
    PUNCT_MAP['>'] = 't';
    PUNCT_MAP['/'] = 'v';
    PUNCT_MAP['?'] = 'c';
    PUNCT_MAP['\''] = '7'; // best-effort - map apostrophe to '7' behavior (rare)

    if (ch && ch.length === 1 && PUNCT_MAP[ch]) return PUNCT_MAP[ch];

    // Prefer code mapping, fallback to key
    const code = e.code;
    if (code && CODE_TO_KEYNAME[code] !== undefined) {
      return CODE_TO_KEYNAME[code];
    }
    // Fallback to key value (lowercase)
    const k = ('' + (e.key || '')).toLowerCase();
    // Map common key names
    if (k === 'enter' || k === 'return') return 'enter';
    if (k === ' ') return 'space';
    if (k === 'shift') return 'shift';
    if (k === 'control' || k === 'ctrl') return 'symshift';
    if (k === 'alt') return 'symshift';
    return k;
  }

  _keydown(e) {
    // Check for special combos first
    if (SPECIAL_COMBOS[e.code]) {
      e.preventDefault();
      const combo = SPECIAL_COMBOS[e.code];
      if (!this.comboPressed.has(e.code)) {
        this.comboPressed.add(e.code);
        for (const key of combo) {
          this.pressKey(key);
        }
        if (this._debug) console.log(`[Input] Combo pressed: ${e.code} -> ${combo.join('+')}`);
      }
      return;
    }

    // Determine normalized key name from event
    const name = this._normalizeEvent(e);
    if (!name) return;

    // If the event has a physical code, check seenKeyCodes for changes
    try {
      const codeKey = e.code || (typeof e.keyCode === 'number' ? ('kc:' + e.keyCode) : null);
      if (codeKey) {
        const prev = this._seenKeyCodes.get(codeKey);
        if (prev && prev !== name) {
          // The same physical key now maps to a different logical name; release the previous.
          try { this.releaseKey(prev); } catch (err) { /* ignore */ }
        }
        this._seenKeyCodes.set(codeKey, name);
      }
    } catch (err) { /* best-effort only */ }

    const pos = KEY_TO_POS.get(name);
    if (!pos) {
      if (this._debug) console.log(`[Input] Unknown key: ${e.code} -> ${name}`);
      return;
    }

    // Prevent browser default for keys we handle
    e.preventDefault();

    if (this.pressed.has(name)) return; // already pressed
    // Route DOM-driven press through pressKey so ULA API path is used consistently
    try { this.pressKey(name); } catch (err) {
      // Fallback to previous inline behavior if pressKey fails
      this.pressed.add(name);
      this.matrix[pos.row] &= ~pos.mask;
      try { if (!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {}; window.__ZX_DEBUG__.lastCapturedKey = name; } catch(e){}
    }
    return;
  }

  _keyup(e) {
    // Check for special combos first
    if (SPECIAL_COMBOS[e.code]) {
      e.preventDefault();
      const combo = SPECIAL_COMBOS[e.code];
      if (this.comboPressed.has(e.code)) {
        this.comboPressed.delete(e.code);
        for (const key of combo) {
          this.releaseKey(key);
        }
        if (this._debug) console.log(`[Input] Combo released: ${e.code}`);
      }
      return;
    }

    // If we have a code that was mapped to a logical name previously, release that mapping first
    try {
      const codeKey = e.code || (typeof e.keyCode === 'number' ? ('kc:' + e.keyCode) : null);
      if (codeKey) {
        const last = this._seenKeyCodes.get(codeKey);
        if (last) {
          e.preventDefault();
          this.releaseKey(last);
          this._seenKeyCodes.delete(codeKey);
          return;
        }
      }
    } catch (err) { /* ignore */ }

    const name = this._normalizeEvent(e);
    if (!name) return;
    
    const pos = KEY_TO_POS.get(name);
    if (!pos) return;
    
    e.preventDefault();
    this.pressed.delete(name);
    
    // Set bit to 1 when released (active low)
    this.matrix[pos.row] |= pos.mask;

    // Test hook: record DOM-driven key release for diagnostics
    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.keyEvents = window.__TEST__.keyEvents || [];
        window.__TEST__.keyEvents.push({ type: 'dom-release', code: e.code, key: name, row: pos.row, mask: pos.mask, pc: (window.__LAST_PC__||null), t: (this._debugTstates || performance.now()) });
        if (window.__TEST__.keyEvents.length > 512) window.__TEST__.keyEvents.shift();

        // Also add a short DOM-focused log for quick inspection
        window.__TEST__.domLog = window.__TEST__.domLog || [];
        window.__TEST__.domLog.push({ type: 'keyup', code: e.code, key: name, row: pos.row, mask: pos.mask, pc: (window.__LAST_PC__||null), t: Date.now() });
        if (window.__TEST__.domLog.length > 256) window.__TEST__.domLog.shift();
      }
    } catch (err) { /* ignore */ }

    if (this._debug) {
      console.log(`[Input] Key UP: ${name} -> row ${pos.row}, mask 0x${pos.mask.toString(16)}, matrix[${pos.row}]=0x${this.matrix[pos.row].toString(16)}`);
    }

    // Immediately sync input to emulator's ULA so key releases take effect without waiting for the next frame
    // Schedule via setTimeout to ensure ordering after DOM event handling
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') setTimeout(() => { try { window.emulator._applyInputToULA(); } catch(e) { void e; } }, 0); } catch (e) { void e; }
  }

  // Programmatically press a key (for virtual keyboard or testing)
  pressKey(name) {
    const normalizedName = name.toLowerCase();
    const pos = KEY_TO_POS.get(normalizedName);
    if (!pos) {
      if (this._debug) console.log(`[Input] pressKey: unknown key '${name}'`);
      return false;
    }
    
    this.pressed.add(normalizedName);
    this.matrix[pos.row] &= ~pos.mask;
    
    if (this._debug) {
      console.log(`[Input] pressKey: ${normalizedName} -> row ${pos.row}, mask 0x${pos.mask.toString(16)}`);
    }

    // Record last captured key for diagnostics and emit key event to window.__TEST__ for diagnostics
    try {
      if (typeof window !== 'undefined') {
        try { if (!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {}; window.__ZX_DEBUG__.lastCapturedKey = normalizedName; } catch(e){}
        try { document.dispatchEvent(new CustomEvent('emu-input-status', { detail: { lastKey: normalizedName, hiddenFocused: (this._hiddenInput && document.activeElement === this._hiddenInput) } })); } catch(e){}
      }
    } catch (e) { /* ignore */ }

    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.keyEvents = window.__TEST__.keyEvents || [];
        window.__TEST__.keyEvents.push({ type: 'press', key: normalizedName, row: pos.row, mask: pos.mask, t: (this._debugTstates || performance.now()) });
        if (window.__TEST__.keyEvents.length > 256) window.__TEST__.keyEvents.shift();
      }
    } catch (e) { /* ignore */ }

    // Test hook: count press hits so we can detect whether pressKey was actually invoked
    try { if (typeof window !== 'undefined') window.__EMU_PRESS_HITS = (window.__EMU_PRESS_HITS || 0) + 1; } catch(e){}

    // Best-effort: update ULA via API so the ROM polling path sees the change immediately
    try {
      if (typeof window !== 'undefined' && window.emulator && window.emulator.ula) {
        try {
          if (typeof window.emulator.ula.setKey === 'function') {
            // Prefer the ULA API which encapsulates keyMatrix semantics
            window.emulator.ula.setKey(pos.row, pos.mask, true);
          } else if (window.emulator.ula.keyMatrix && (typeof window.emulator.ula.keyMatrix.length === 'number')) {
            // Fallback to direct mutation if API not present
            window.emulator.ula.keyMatrix[pos.row] &= ~pos.mask;
          }
        } catch (e) { /* ignore per best-effort */ }
        try { if (typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch(e) {}
        try { if (typeof window.emulator.ula.render === 'function') window.emulator.ula.render(); } catch(e) {}
        try { if (typeof window !== 'undefined' && window.__TEST__ && window.emulator.ula.keyMatrix) window.__TEST__.lastAppliedKeyMatrix = Array.from(window.emulator.ula.keyMatrix); } catch(e) {}
      }
    } catch(e) { /* ignore */ }

    // Also schedule ULA sync in microtask so test/API-driven presses take effect quickly
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') setTimeout(() => { try { window.emulator._applyInputToULA(); } catch(e) { void e; } }, 0); } catch (e) { void e; }

    // Also sync immediately to emulator's ULA
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch (e) { void e; }

    return true;
  }

  // Programmatically release a key
  releaseKey(name) {
    const normalizedName = name.toLowerCase();
    const pos = KEY_TO_POS.get(normalizedName);
    if (!pos) {
      if (this._debug) console.log(`[Input] releaseKey: unknown key '${name}'`);
      return false;
    }
    
    this.pressed.delete(normalizedName);
    this.matrix[pos.row] |= pos.mask;
    
    if (this._debug) {
      console.log(`[Input] releaseKey: ${normalizedName} -> row ${pos.row}, mask 0x${pos.mask.toString(16)}`);
    }

    // Test hook: emit key event to window.__TEST__ for diagnostics
    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.keyEvents = window.__TEST__.keyEvents || [];
        window.__TEST__.keyEvents.push({ type: 'release', key: normalizedName, row: pos.row, mask: pos.mask, t: (this._debugTstates || performance.now()) });
        if (window.__TEST__.keyEvents.length > 256) window.__TEST__.keyEvents.shift();
      }
    } catch (e) { /* ignore */ }

    // Best-effort: update the ULA keyMatrix directly so the ROM polling path sees the change immediately
    try {
      if (typeof window !== 'undefined' && window.emulator && window.emulator.ula && window.emulator.ula.keyMatrix && (typeof window.emulator.ula.keyMatrix.length === 'number')) {
        // set active-low bit to 1 for released key (mark released)
        window.emulator.ula.keyMatrix[pos.row] |= pos.mask;
        try { if (typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch(e) {}
        try { if (typeof window.emulator.ula.render === 'function') window.emulator.ula.render(); } catch(e) {}
        try { if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__.lastAppliedKeyMatrix = Array.from(window.emulator.ula.keyMatrix); } catch(e) {}
      }
    } catch(e) { /* ignore */ }

    // Also sync immediately to emulator's ULA
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch (e) { void e; }

    return true;
  }

  // ZX Spectrum reads port 0xFE. The address lines A8..A15 select rows: a zero bit selects that row.
  // getPortValue accepts full 16-bit port address (usually provided by CPU IN instruction)
  getPortValue(port) {
    if ((port & 0xff) !== 0xfe) return 0xff; // not keyboard/tape port
    
    const highByte = (port >> 8) & 0xff;
    
    // Start with all bits high (no key pressed)
    // Bits 0-4: keyboard data (active low)
    // Bit 5: tape EAR input (1 = no signal)
    // Bits 6-7: always 1
    let result = 0xff;
    
    // Check each row: if corresponding address bit is LOW (0), include that row
    for (let row = 0; row < 8; row++) {
      // Address line A8+row selects row when it's 0
      if (((highByte >> row) & 1) === 0) {
        // AND in this row's key state (only lower 5 bits matter)
        result &= (this.matrix[row] | 0b11100000);
      }
    }
    
    if (this._debug && result !== 0xff) {
      console.log(`[Input] getPortValue(0x${port.toString(16)}): highByte=0x${highByte.toString(16)}, result=0x${result.toString(16)}`);
    }
    
    return result & 0xff;
  }

  isKeyPressed(name) {
    return this.pressed.has(name.toLowerCase());
  }

  // Get the current state of the keyboard matrix for debugging
  getMatrixState() {
    const state = {};
    for (let row = 0; row < 8; row++) {
      state[`row${row}`] = {
        value: this.matrix[row],
        hex: `0x${this.matrix[row].toString(16).padStart(2, '0')}`,
        keys: ROW_KEYS[row],
        pressed: ROW_KEYS[row].filter((key, bit) => (this.matrix[row] & (1 << bit)) === 0)
      };
    }
    return state;
  }

  // Ensure hidden input exists to capture IME / soft-keyboard events (best-effort)
  _ensureHiddenInput() {
    if (this._hiddenInput) return this._hiddenInput;
    try {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = '__emu_hidden_input';
      inp.autocapitalize = 'none';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:auto;';
      inp.addEventListener('focus', () => { try { inp.selectionStart = inp.selectionEnd = 0; inp.setSelectionRange(0,0); if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.hiddenInputFocused = true; try { document.dispatchEvent(new CustomEvent('emu-input-status', { detail: { lastKey: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.lastCapturedKey) || '(none)', hiddenFocused: true } })); } catch(e){} } catch(e){} }, { passive: true });
      inp.addEventListener('blur', () => { try { if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.hiddenInputFocused = false; try { document.dispatchEvent(new CustomEvent('emu-input-status', { detail: { lastKey: (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.lastCapturedKey) || '(none)', hiddenFocused: false } })); } catch(e){} } catch(e){} }, { passive: true });
      document.body.appendChild(inp);
      this._hiddenInput = inp;

      this._onHiddenInput = (e) => {
        try {
          const v = inp.value || '';
          const last = v.length ? v[v.length - 1] : '';
          if (last) {
            const keyName = ('' + last).toLowerCase();

            // Record last captured key for diagnostics
            try { if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.lastCapturedKey = keyName; } catch(e){}
            try { document.dispatchEvent(new CustomEvent('emu-input-status', { detail: { lastKey: keyName, hiddenFocused: (document.activeElement === inp) } })); } catch(e){}

            if (KEY_TO_POS.has(keyName)) {
              this.pressKey(keyName);
              // Hold a little longer to increase probability the ROM will poll during the key press
              setTimeout(() => this.releaseKey(keyName), 200);
            } else if (last === ' ') {
              this.pressKey('space'); setTimeout(() => this.releaseKey('space'), 200);
            }

            // synthetic key events for compatibility
            try {
              const code = last.match(/[a-z]/i) ? `Key${last.toUpperCase()}` : ('Digit' + last);
              window.dispatchEvent(new KeyboardEvent('keydown', { key: last, code: code, bubbles: true }));
              setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { key: last, code: code, bubbles: true })); }, 200);
            } catch (e) { /* ignore */ }
            
          }
        } catch (e) { /* ignore */ } finally { inp.value = ''; }
      };

      this._onCompositionStart = () => {};
      this._onCompositionEnd = (e) => { try { const text = e.data || ''; if (text) { const last = text[text.length-1]; if (last && KEY_TO_POS.has(last.toLowerCase())) { this.pressKey(last.toLowerCase()); setTimeout(()=>this.releaseKey(last.toLowerCase()),200); } } } catch(e){} };

      inp.addEventListener('input', this._onHiddenInput, { passive: true });
      inp.addEventListener('compositionstart', this._onCompositionStart, { passive: true });
      inp.addEventListener('compositionend', this._onCompositionEnd, { passive: true });
    } catch (e) { /* best effort */ }
    return this._hiddenInput;
  }

  // Create a simple virtual keyboard overlay inside container (HTMLElement or selector)
  createVirtualKeyboard(container = 'body') {
    const root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) return null;
    
    const overlay = document.createElement('div');
    overlay.className = 'zxvk-overlay';
    overlay.style.cssText = `
      position: fixed;
      right: 10px;
      bottom: 10px;
      background: rgba(0,0,0,0.85);
      padding: 8px;
      border-radius: 6px;
      z-index: 9999;
      user-select: none;
      font-family: monospace;
    `;

    // Add a small header so the keyboard can be dragged
    const header = document.createElement('div');
    header.style.cssText = 'cursor:move; display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;';
    header.innerHTML = `<div style="font-weight:bold;color:#fff;font-size:12px;">Keyboard</div>`;
    overlay.appendChild(header);

    // Restore saved visibility
    try {
      const savedVisible = localStorage.getItem('__emu_kbd_visible');
      const isVisible = savedVisible === null ? true : (savedVisible === 'true');
      overlay.style.display = isVisible ? 'block' : 'none';
    } catch (e) { /* ignore */ }

    // Restore saved position if available
    try {
      const posJson = localStorage.getItem('__emu_kbd_pos');
      if (posJson) {
        const pos = JSON.parse(posJson);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') {
          overlay.style.left = pos.left + 'px';
          overlay.style.top = pos.top + 'px';
          overlay.style.right = 'auto';
          overlay.style.bottom = 'auto';
        }
      }
    } catch (e) { /* ignore */ }

    // ZX Spectrum keyboard layout (visual representation)
    const keyboardLayout = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'enter'],
      ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'symshift', 'space']
    ];

    const keyLabels = {
      'shift': 'CS',
      'symshift': 'SS',
      'enter': 'ENT',
      'space': 'SPC'
    };

    keyboardLayout.forEach((rowKeys, rowIndex) => {
      const rowDiv = document.createElement('div');
      rowDiv.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 4px;
        margin-bottom: 4px;
      `;

      rowKeys.forEach(key => {
        const btn = document.createElement('button');
        const label = keyLabels[key] || key.toUpperCase();
        btn.textContent = label;
        btn.dataset.key = key;
        btn.style.cssText = `
          width: ${key.length > 1 ? '40px' : '28px'};
          height: 28px;
          font-size: 10px;
          font-weight: bold;
          background: #333;
          color: #fff;
          border: 1px solid #666;
          border-radius: 3px;
          cursor: pointer;
          touch-action: manipulation;
        `;

        // Use pointer events for touch and mouse compatibility
        btn.addEventListener('pointerdown', (e) => {
          // Keep keyboard open during press (good for typing multiple chars)
          // Don't call preventDefault here; allow browser to process the user gesture so focus() is honored
          btn.style.background = '#666';
          this.pressKey(key);
          try { this._ensureHiddenInput()?.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
        });

        btn.addEventListener('pointerup', (e) => {
          // Prevent default on pointerup to avoid synthetic click behaviours interfering
          e.preventDefault();
          btn.style.background = '#333';
          // Ensure the hidden input is focused (user gesture on pointerup guarantees keyboard pop on mobile)
          try { this._ensureHiddenInput()?.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
          this.releaseKey(key);
          try { this._ensureHiddenInput()?.blur(); } catch (err) { /* ignore */ }
        });

        btn.addEventListener('pointerleave', (e) => {
          btn.style.background = '#333';
          this.releaseKey(key);
          try { this._ensureHiddenInput()?.blur(); } catch (err) { /* ignore */ }
        });

        // Prevent context menu on long press
        btn.addEventListener('contextmenu', (e) => e.preventDefault());

        rowDiv.appendChild(btn);
      });

      overlay.appendChild(rowDiv);
    });

    // Add close button (placed in header)
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      width: 20px;
      height: 20px;
      background: #666;
      color: #fff;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
    `;
    // Hide overlay and persist visibility, also update controls toggle if present
    closeBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      try { localStorage.setItem('__emu_kbd_visible', 'false'); } catch(e) {}
      const t = document.getElementById('__emu_kbd_toggle'); if (t) t.checked = false;
    });
    header.appendChild(closeBtn);

    // Add drag/persist handlers bound to header
    try {
      let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
      const onMove = (clientX, clientY) => {
        const dx = clientX - startX; const dy = clientY - startY;
        overlay.style.left = (startLeft + dx) + 'px';
        overlay.style.top = (startTop + dy) + 'px';
        overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
      };

      const onMouseMove = (ev) => { if (!dragging) return; onMove(ev.clientX, ev.clientY); };
      const onMouseUp = (ev) => { if (!dragging) return; dragging = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); try { localStorage.setItem('__emu_kbd_pos', JSON.stringify({ left: parseInt(overlay.style.left, 10) || 0, top: parseInt(overlay.style.top, 10) || 0 })); } catch(e){} };
      header.addEventListener('mousedown', (ev) => { dragging = true; startX = ev.clientX; startY = ev.clientY; const r = overlay.getBoundingClientRect(); startLeft = r.left; startTop = r.top; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); ev.preventDefault(); });

      // Touch support
      const onTouchMove = (ev) => { if (!dragging) return; if (ev.touches && ev.touches[0]) onMove(ev.touches[0].clientX, ev.touches[0].clientY); ev.preventDefault(); };
      const onTouchEnd = (ev) => { if (!dragging) return; dragging = false; document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); try { localStorage.setItem('__emu_kbd_pos', JSON.stringify({ left: parseInt(overlay.style.left, 10) || 0, top: parseInt(overlay.style.top, 10) || 0 })); } catch(e){} };
      header.addEventListener('touchstart', (ev) => { dragging = true; if (ev.touches && ev.touches[0]) { startX = ev.touches[0].clientX; startY = ev.touches[0].clientY; const r = overlay.getBoundingClientRect(); startLeft = r.left; startTop = r.top; } document.addEventListener('touchmove', onTouchMove, { passive: false }); document.addEventListener('touchend', onTouchEnd); ev.preventDefault(); });
    } catch (e) { /* non-critical */ }

    root.appendChild(overlay);
    this.overlay = overlay;
    
    if (this._debug) console.log('[Input] Virtual keyboard created');
    return overlay;
  }
}

// Export the ROW_KEYS for testing/debugging purposes
export { ROW_KEYS, KEY_TO_POS, DEFAULT_ROW };
