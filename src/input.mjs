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
  }

  // Enable/disable debug logging
  setDebug(enabled) {
    this._debug = enabled;
  }

  start() {
    window.addEventListener('keydown', this._keydown, { passive: false });
    window.addEventListener('keyup', this._keyup, { passive: false });
    if (this._debug) console.log('[Input] Keyboard listeners started');
  }

  stop() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
    if (this._debug) console.log('[Input] Keyboard listeners stopped');
  }

  // Reset all keys to released state
  reset() {
    for (let i = 0; i < 8; i++) this.matrix[i] = DEFAULT_ROW;
    this.pressed.clear();
    this.comboPressed.clear();
    if (this._debug) console.log('[Input] Keyboard matrix reset');
  }

  _normalizeEvent(e) {
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

    const name = this._normalizeEvent(e);
    if (!name) return;
    
    const pos = KEY_TO_POS.get(name);
    if (!pos) {
      if (this._debug) console.log(`[Input] Unknown key: ${e.code} -> ${name}`);
      return;
    }
    
    // Prevent browser default for keys we handle
    e.preventDefault();
    
    if (this.pressed.has(name)) return; // already pressed
    this.pressed.add(name);
    
    // Set bit to 0 when pressed (active low)
    this.matrix[pos.row] &= ~pos.mask;
    
    if (this._debug) {
      console.log(`[Input] Key DOWN: ${name} -> row ${pos.row}, mask 0x${pos.mask.toString(16)}, matrix[${pos.row}]=0x${this.matrix[pos.row].toString(16)}`);
    }

    // Immediately sync input to emulator's ULA so key presses take effect without waiting for the next frame
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch (e) { void e; }
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

    const name = this._normalizeEvent(e);
    if (!name) return;
    
    const pos = KEY_TO_POS.get(name);
    if (!pos) return;
    
    e.preventDefault();
    this.pressed.delete(name);
    
    // Set bit to 1 when released (active low)
    this.matrix[pos.row] |= pos.mask;
    
    if (this._debug) {
      console.log(`[Input] Key UP: ${name} -> row ${pos.row}, mask 0x${pos.mask.toString(16)}, matrix[${pos.row}]=0x${this.matrix[pos.row].toString(16)}`);
    }

    // Immediately sync input to emulator's ULA so key releases take effect without waiting for the next frame
    try { if (typeof window !== 'undefined' && window.emulator && typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch (e) { void e; }
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

    // Test hook: emit key event to window.__TEST__ for diagnostics
    try {
      if (typeof window !== 'undefined' && window.__TEST__) {
        window.__TEST__.keyEvents = window.__TEST__.keyEvents || [];
        window.__TEST__.keyEvents.push({ type: 'press', key: normalizedName, row: pos.row, mask: pos.mask, t: (this._debugTstates || performance.now()) });
        if (window.__TEST__.keyEvents.length > 256) window.__TEST__.keyEvents.shift();
      }
    } catch (e) { /* ignore */ }

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
          e.preventDefault();
          btn.style.background = '#666';
          this.pressKey(key);
        });

        btn.addEventListener('pointerup', (e) => {
          e.preventDefault();
          btn.style.background = '#333';
          this.releaseKey(key);
        });

        btn.addEventListener('pointerleave', (e) => {
          btn.style.background = '#333';
          this.releaseKey(key);
        });

        // Prevent context menu on long press
        btn.addEventListener('contextmenu', (e) => e.preventDefault());

        rowDiv.appendChild(btn);
      });

      overlay.appendChild(rowDiv);
    });

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 2px;
      right: 2px;
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
    closeBtn.addEventListener('click', () => {
      overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    });
    overlay.appendChild(closeBtn);

    root.appendChild(overlay);
    this.overlay = overlay;
    
    if (this._debug) console.log('[Input] Virtual keyboard created');
    return overlay;
  }
}

// Export the ROW_KEYS for testing/debugging purposes
export { ROW_KEYS, KEY_TO_POS, DEFAULT_ROW };
