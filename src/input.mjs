// src/input.mjs
// ZX Spectrum keyboard input module (ES6)

// Matrix: 8 rows x 5 bits (0 = pressed, 1 = released)
// Row indexing follows common Spectrum layout:
// 0: SHIFT Z X C V
// 1: A S D F G
// 2: Q W E R T
// 3: 1 2 3 4 5
// 4: 0 9 8 7 6
// 5: P O I U Y
// 6: ENTER L K J H
// 7: SPACE SYM M N B

const DEFAULT_ROW = 0b11111; // 5 bits, 1 = unpressed

const ROW_KEYS = [
  ['Shift', 'Z', 'X', 'C', 'V'],
  ['A', 'S', 'D', 'F', 'G'],
  ['Q', 'W', 'E', 'R', 'T'],
  ['1', '2', '3', '4', '5'],
  ['0', '9', '8', '7', '6'],
  ['P', 'O', 'I', 'U', 'Y'],
  ['Enter', 'L', 'K', 'J', 'H'],
  ['Space', 'SymShift', 'M', 'N', 'B']
];

// Build mapping from key name to (row, bitMask)
const KEY_TO_POS = new Map();
for (let r = 0; r < ROW_KEYS.length; r++) {
  for (let b = 0; b < ROW_KEYS[r].length; b++) {
    KEY_TO_POS.set(ROW_KEYS[r][b].toLowerCase(), { row: r, mask: 1 << b });
  }
}

// Common browser key code -> key name used above
const CODE_TO_KEYNAME = Object.assign(Object.create(null), {
  // Letters
  KeyZ: 'z', KeyX: 'x', KeyC: 'c', KeyV: 'v', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyG: 'g',
  KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyT: 't', KeyP: 'p', KeyO: 'o', KeyI: 'i', KeyU: 'u', KeyY: 'y',
  KeyL: 'l', KeyK: 'k', KeyJ: 'j', KeyH: 'h', KeyM: 'm', KeyN: 'n', KeyB: 'b',
  // Numbers
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  // Special keys
  Enter: 'enter', Space: 'space', ShiftLeft: 'shift', ShiftRight: 'symshift',
  // Fallbacks (some browsers / layouts)
  Backquote: 'symshift', Quote: 'symshift'
});

export default class Input {
  constructor() {
    // Each row is stored as 5-bit value (1 = up, 0 = pressed)
    this.matrix = new Uint8Array(8);
    for (let i = 0; i < 8; i++) this.matrix[i] = DEFAULT_ROW;

    // Track pressed keys by normalized name
    this.pressed = new Set();

    // Event handlers bound so they can be removed
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);

    // Optionally created overlay element
    this.overlay = null;
  }

  start() {
    window.addEventListener('keydown', this._keydown, { passive: false });
    window.addEventListener('keyup', this._keyup, { passive: false });
  }

  stop() {
    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);
  }

  _normalizeEvent(e) {
    // Prefer code mapping, fallback to key
    const code = e.code;
    if (code && CODE_TO_KEYNAME[code]) return CODE_TO_KEYNAME[code];
    const k = ('' + (e.key || '')).toLowerCase();
    return k;
  }

  _keydown(e) {
    const name = this._normalizeEvent(e);
    if (!name) return;
    const pos = KEY_TO_POS.get(name);
    if (!pos) return;
    // Prevent browser default for keys we handle
    e.preventDefault();
    if (this.pressed.has(name)) return; // already pressed
    this.pressed.add(name);
    this.matrix[pos.row] &= ~pos.mask; // set bit to 0 when pressed
  }

  _keyup(e) {
    const name = this._normalizeEvent(e);
    if (!name) return;
    const pos = KEY_TO_POS.get(name);
    if (!pos) return;
    e.preventDefault();
    this.pressed.delete(name);
    this.matrix[pos.row] |= pos.mask; // release -> set bit to 1
  }

  // ZX Spectrum reads port 0xFE. The address lines A8..A15 select rows: a zero bit selects that row.
  // getPortValue accepts full 16-bit port address (usually provided by CPU IN instruction)
  getPortValue(port) {
    if ((port & 0xff) !== 0xfe) return 0xff; // not keyboard/tape port
    let value = 0b11111111; // 8-bit result; upper bits (7..5) remain 1 except tape/ear etc.
    for (let row = 0; row < 8; row++) {
      const sel = (port >> (8 + row)) & 1;
      if (sel === 0) {
        // Combine (AND) selected rows. matrix stores only 5 bits (0..4)
        value &= this.matrix[row] | 0b11100000; // keep upper bits set
      }
    }
    return value & 0xff;
  }

  isKeyPressed(name) {
    return this.pressed.has(('' + name).toLowerCase());
  }

  // Create a simple virtual keyboard overlay inside container (HTMLElement or selector)
  createVirtualKeyboard(container = 'body') {
    const root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) return null;
    const overlay = document.createElement('div');
    overlay.className = 'zxvk-overlay';
    overlay.style.position = 'fixed';
    overlay.style.right = '10px';
    overlay.style.bottom = '10px';
    overlay.style.background = 'rgba(0,0,0,0.6)';
    overlay.style.padding = '8px';
    overlay.style.borderRadius = '6px';
    overlay.style.zIndex = 9999;
    overlay.style.display = 'grid';
    overlay.style.gridTemplateColumns = 'repeat(5, 40px)';
    overlay.style.gridGap = '6px';
    overlay.style.userSelect = 'none';

    // Build buttons in row order
    for (let r = 0; r < ROW_KEYS.length; r++) {
      for (let b = 0; b < ROW_KEYS[r].length; b++) {
        const keyName = ROW_KEYS[r][b];
        const btn = document.createElement('button');
        btn.textContent = keyName === 'SymShift' ? 'SYM' : keyName;
        btn.title = keyName;
        btn.dataset.key = keyName.toLowerCase();
        btn.style.width = '40px';
        btn.style.height = '28px';
        btn.style.fontSize = '12px';
        btn.style.cursor = 'pointer';
        btn.style.border = '1px solid #888';
        btn.style.background = '#222';
        btn.style.color = '#fff';

        btn.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          const n = btn.dataset.key;
          const pos = KEY_TO_POS.get(n);
          if (!pos) return;
          this.pressed.add(n);
          this.matrix[pos.row] &= ~pos.mask;
          btn.style.opacity = '0.6';
        });
        const up = (ev) => {
          ev.preventDefault();
          const n = btn.dataset.key;
          const pos = KEY_TO_POS.get(n);
          if (!pos) return;
          this.pressed.delete(n);
          this.matrix[pos.row] |= pos.mask;
          btn.style.opacity = '1';
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);

        overlay.appendChild(btn);
      }
    }

    root.appendChild(overlay);
    this.overlay = overlay;
    return overlay;
  }
}
