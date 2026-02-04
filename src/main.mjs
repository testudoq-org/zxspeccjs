/* eslint-env browser */
/* eslint-disable no-undef, no-empty */
/* global window, document, performance, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout, console, navigator, caches, location, localStorage */
import spec48 from './roms/spec48.js';
import romManager from './romManager.mjs';
import { Loader } from './loader.mjs';
import { Z80 } from './z80.mjs';
import { Memory } from './memory.mjs';
import { ULA } from './ula.mjs';
import Input from './input.mjs';
import { Sound } from './sound.mjs';

const TSTATES_PER_FRAME = 69888; // ZX Spectrum 50Hz frame
const FRAME_MS = 1000 / 50; // 20ms

export class Emulator {
  constructor(opts = {}) {
    this.canvas = opts.canvas || document.getElementById('screen');
    this.statusEl = opts.statusEl || document.getElementById('status');
    this.romInput = opts.romInput || document.getElementById('romFile');
    console.log('[Emulator] constructor: canvas', this.canvas, 'statusEl', this.statusEl, 'romInput', this.romInput);

    // Store options for later use during initialization
    this._opts = opts;

    this.cpu = null;
    this.memory = null;
    this.ula = null;
    this.sound = null;
    this.input = new Input();

    this.romBuffer = null; // last loaded ROM

    this._running = false;
    this._rafId = null;
    this._lastTime = 0;
    this._acc = 0;

    // Boot frames: Wait for ROM to fully initialize display before rendering
    // ROM boot takes ~90 frames to reach EI and ~200 frames to print copyright
    this._bootFramesRemaining = 250;

    // Track the number of memWrites observed so we can detect new video writes during boot
    this._lastMemWritesLen = 0;

    // Track last observed CHARS system variable to detect when ROM sets character set pointer
    this._lastChars = 0;  // 16-bit value (hi<<8 | lo) - used to trigger a one-time re-render when ROM sets CHARS

    // Debug API state
    this._debugEnabled = true;
    this._bootAddresses = [0x15EB];
    this._portWrites = [];
    this._executedOpcodes = [];
    this._lastPC = 0;
    this._bootComplete = false;
    
    // Keyboard debug flag
    this._keyboardDebug = false;

    this._bindUI();
  }

  // Enable/disable keyboard debugging
  setKeyboardDebug(enabled) {
    this._keyboardDebug = enabled;
    if (this.input) this.input.setDebug(enabled);
    if (this.ula) this.ula.setDebug(enabled);
  }

  // Debug API methods
  getRegisters() {
    if (!this.cpu) return null;
    return {
      A: this.cpu.A,
      F: this.cpu.F,
      B: this.cpu.B,
      C: this.cpu.C,
      D: this.cpu.D,
      E: this.cpu.E,
      H: this.cpu.H,
      L: this.cpu.L,
      PC: this.cpu.PC,
      SP: this.cpu.SP,
      IX: this.cpu.IX,
      IY: this.cpu.IY,
      IFF1: this.cpu.IFF1,
      IFF2: this.cpu.IFF2,
      IM: this.cpu.IM,
      tstates: this.cpu.tstates
    };
  }

  getPC() {
    if (this.cpu) {
      // Try multiple sources for maximum reliability
      if (typeof window !== 'undefined' && window.__LAST_PC__ !== undefined) {
        return window.__LAST_PC__;
      }
      return this.cpu.PC;
    }
    // Fallback for non-browser environments
    return (typeof window !== 'undefined') ? (window.__LAST_PC__ || 0) : 0;
  }
  
  // Enhanced method to get PC with fallback support
  getCurrentPC() {
    // Primary: window.__LAST_PC__ (most recent instruction executed)
    if (typeof window !== 'undefined' && window.__LAST_PC__ !== undefined) {
      return window.__LAST_PC__;
    }
    
    // Secondary: CPU's fallback PC (for non-browser environments)
    if (this.cpu && this.cpu._fallbackPC !== undefined) {
      return this.cpu._fallbackPC;
    }
    
    // Tertiary: Direct CPU PC (may be ahead of last executed instruction)
    if (this.cpu) {
      return this.cpu.PC;
    }
    
    // Last resort: 0
    return 0;
  }

  getAF() {
    return this.cpu ? this.cpu._getAF() : 0;
  }

  getBC() {
    return this.cpu ? this.cpu._getBC() : 0;
  }

  getDE() {
    return this.cpu ? this.cpu._getDE() : 0;
  }

  getHL() {
    return this.cpu ? this.cpu._getHL() : 0;
  }

  peekMemory(address, length = 1) {
    if (!this.memory) return null;
    const result = [];
    for (let i = 0; i < length; i++) {
      result.push(this.memory.read((address + i) & 0xffff));
    }
    return result;
  }

  readROM(address) {
    if (!this.memory) return null;
    return this.memory.read(address & 0xffff);
  }

  readRAM(address) {
    if (!this.memory) return null;
    return this.memory.read(address & 0xffff);
  }

  getPortWrites() {
    return this._portWrites;
  }

  getLastPortWrite() {
    return this._portWrites.length > 0 ? this._portWrites[this._portWrites.length - 1] : null;
  }

  _trackPortWrite(port, value) {
    if (this._debugEnabled) {
      const entry = { port, value, tstates: this.cpu ? this.cpu.tstates : 0 };
      this._portWrites.push(entry);
      // expose to page debug API for tests
      try{ if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.portWrites = this._portWrites; }catch(e){ /* best-effort only */ }
    }
  }

  _trackOpcodeExecution(opcode, pc) {
    if (this._debugEnabled) {
      this._executedOpcodes.push(`0x${opcode.toString(16).padStart(2, '0')} at 0x${pc.toString(16).padStart(4, '0')}`);
      this._lastPC = pc;

      // Track boot progression
      if (this._bootAddresses.includes(pc)) {
        // mark visited set for later inspection
        try{ if (this.cpu && this.cpu._visitedBootAddresses) this.cpu._visitedBootAddresses.add(pc); }catch{ /* ignore */ }
      }

      // ensure we update watcher history if present (records every instruction PC)
      if (typeof window !== 'undefined' && window.__PC_WATCHER__ && Array.isArray(window.__PC_WATCHER__.history)) {
        try {
          const h = window.__PC_WATCHER__.history;
          // Defensive checks: ensure pc is a finite number and history is mutable
          if (Number.isFinite(pc)) {
            try {
              const last = (h.length > 0) ? h[h.length - 1] : null;
              if (last !== pc && typeof h.push === 'function') h.push(pc);
            } catch { /* ignore mutation-read errors */ }
          }
          // Trim history safely if shift is available
          try { if (h.length > 10000 && typeof h.shift === 'function') h.shift(); } catch { /* ignore */ }
        } catch { /* ignore */ }
      }

      // Expose a small debug API into the page to make tests reliable and robust
      if (typeof window !== 'undefined') {
        try{
          window.__LAST_PC__ = pc;
          if(!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {};
          window.__ZX_DEBUG__.executedOpcodes = this._executedOpcodes;
          window.__ZX_DEBUG__.bootComplete = this._bootComplete;
          window.__ZX_DEBUG__.timing = { tstates: this.cpu ? this.cpu.tstates : 0 };
          window.__ZX_DEBUG__.getRegisters = () => ({
            A: this.cpu ? this.cpu.A : 0,
            F: this.cpu ? this.cpu.F : 0,
            B: this.cpu ? this.cpu.B : 0,
            C: this.cpu ? this.cpu.C : 0,
            D: this.cpu ? this.cpu.D : 0,
            E: this.cpu ? this.cpu.E : 0,
            H: this.cpu ? this.cpu.H : 0,
            L: this.cpu ? this.cpu.L : 0,
            PC: this.cpu ? this.cpu.PC : 0,
            SP: this.cpu ? this.cpu.SP : 0,
            IX: this.cpu ? this.cpu.IX : 0,
            IY: this.cpu ? this.cpu.IY : 0,
            IFF1: this.cpu ? this.cpu.IFF1 : false,
            IFF2: this.cpu ? this.cpu.IFF2 : false,
            IM: this.cpu ? this.cpu.IM : 0,
            tstates: this.cpu ? this.cpu.tstates : 0
          });
          window.__ZX_DEBUG__.peekMemory = (addr, len) => {
            const out = [];
            try{ for(let i=0;i<len;i++) out.push(this.memory ? this.memory.read((addr + i) & 0xFFFF) : 0); }catch(e){ void e; }
            return out;
          };
        }catch(e){ /* best-effort only */ }
      }

      // Check for boot completion (at final boot address)
      if (this._bootAddresses.includes(pc)) {
        this._bootComplete = true;
        // reflect on debug object too
        try{ if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.bootComplete = true; }catch{ /* ignore */ }
      }
    }
  }

  _bindUI() {
    try { this._bindButtons(); } catch { /* ignore */ }
    try { this._bindRomSelector(); } catch { /* ignore */ }
    try { this._bindKeyboardToggle(); } catch { /* ignore */ }
    try { this._bindCanvasFocus(); } catch { /* ignore */ }
  }

  _bindButtons() {
    const loadBtn = document.getElementById('loadBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (loadBtn) loadBtn.addEventListener('click', () => this.handleLoad());
    if (startBtn) startBtn.addEventListener('click', () => this.start());
    if (stopBtn) stopBtn.addEventListener('click', () => this.pause());
    if (resetBtn) resetBtn.addEventListener('click', () => {
      try {
        if (typeof window !== 'undefined' && typeof window.__EMU_clearCacheAndReload === 'function') {
          window.__EMU_clearCacheAndReload();
        } else {
          this.reset();
        }
      } catch { try { this.reset(); } catch { /* ignore */ } }
    });

    // Allow file input drag/drop helpers
    if (this.romInput) Loader.attachInput(this.romInput, (result, file) => this._onFileLoaded(result, file));
  }

  _bindRomSelector() {
    try {
      const sel = document.getElementById('rom-select');
      if (sel) {
        romManager.initRomSelector(sel, async (id) => {
          try {
            this.status(`loading ROM: ${id}...`);
            const data = await romManager.loadRom(id);
            // initialize core with ROM bytes and apply memory configuration
            await this.loadROM(data.rom);
            try { romManager.applyMemoryConfig(this.memory, data.metadata, data.rom); } catch { /* ignore */ }
            this.status(`selected ROM: ${id}`);
            this._selectedRom = id;
          } catch (e) {
            console.error('ROM load failed', e);
            this.status('ROM load failed');
          }
        });
      }
    } catch { /* ignore */ }

    try {
      if (typeof spec48 !== 'undefined' && spec48) {
        // indicate default ROM available; keep manual load as an override option
        if (this.statusEl) this.statusEl.textContent = 'Status: default ROM (spec48) available';
        const loadBtn = document.getElementById('loadBtn');
        if (loadBtn) loadBtn.textContent = 'Load (override default)';
      }
    } catch { /* ignore */ }

    // Virtual keyboard toggle (optional)
    try { this.input.createVirtualKeyboard('body'); } catch { /* ignore */ }
  }

  _bindKeyboardToggle() {
    try {
      const controls = document.querySelector('.controls');
      if (controls) {
        const label = document.createElement('label');
        label.style.color = '#ccc';
        label.style.marginTop = '6px';
        label.innerHTML = `<input id="__emu_kbd_toggle" type="checkbox" style="margin-right:6px;"> Show Keyboard`;
        controls.appendChild(label);

        const toggle = label.querySelector('#__emu_kbd_toggle');
        const savedVisible = localStorage.getItem('__emu_kbd_visible');
        const isVisible = savedVisible === null ? true : (savedVisible === 'true');
        toggle.checked = isVisible;

        // Apply initial visibility to overlay if created
        try { const ov = this.input.overlay || document.querySelector('.zxvk-overlay'); if (ov) ov.style.display = isVisible ? 'block' : 'none'; } catch { /* ignore */ }

        toggle.addEventListener('change', (e) => {
          const show = Boolean(e.target.checked);
          try { const ov = this.input.overlay || document.querySelector('.zxvk-overlay'); if (ov) ov.style.display = show ? 'block' : 'none'; } catch { /* ignore */ }
          try { localStorage.setItem('__emu_kbd_visible', String(show)); } catch { /* ignore */ }
        });
      }
    } catch { /* ignore */ }
  }

  _bindCanvasFocus() {
    try {
      if (this.canvas && typeof this.canvas === 'object') {
        this.canvas.tabIndex = 0; // allow focus via script
        this.canvas.addEventListener('click', () => { try { this.canvas.focus(); } catch { /* ignore */ } });
      }
    } catch { /* ignore */ }
  }

  async handleLoad() {
    if (!this.romInput || !this.romInput.files || !this.romInput.files[0]) return;
    const file = this.romInput.files[0];
    this.status('loading ROM...');
    try {
      const parsed = await Loader.loadFromFile(file);
      await this._onFileLoaded(parsed, file);
      this.status('loaded');
    } catch (e) {
      console.error('load error', e);
      this.status('load error');
    }
  }

  async _onFileLoaded(parsed, file) {
    // parsed can be ArrayBuffer (ROM) or object {rom:null, snapshot:{ram, registers}} or tap
    if (parsed instanceof ArrayBuffer || ArrayBuffer.isView(parsed)) {
      const buf = parsed instanceof ArrayBuffer ? parsed : parsed.buffer;
      await this.loadROM(buf);
      this.status(`ROM ${file.name} loaded`);
    } else if (parsed && parsed.snapshot) {
      // create emulator if needed
      if (!this.memory) await this._createCore(parsed.rom || null);
      // load snapshot RAM
      if (parsed.snapshot.ram) {
        // ram in Memory starts at index 0
        this.memory.ram.set(parsed.snapshot.ram.subarray(0, Math.min(parsed.snapshot.ram.length, this.memory.RAM_SIZE)));
      }
      // set CPU registers if present
      if (!this.cpu) this.cpu = new Z80(this.memory);
      const regs = parsed.snapshot.registers || {};
      // set a few registers defensively
      if (typeof regs.PC === 'number') this.cpu.PC = regs.PC & 0xffff;
      if (typeof regs.SP === 'number') this.cpu.SP = regs.SP & 0xffff;
      if (typeof regs.A === 'number') this.cpu.A = regs.A & 0xff;
      if (typeof regs.F === 'number') this.cpu.F = regs.F & 0xff;
      if (typeof regs.B === 'number') this.cpu.B = regs.B & 0xff;
      if (typeof regs.C === 'number') this.cpu.C = regs.C & 0xff;
      if (typeof regs.H === 'number') this.cpu.H = regs.H & 0xff;
      if (typeof regs.L === 'number') this.cpu.L = regs.L & 0xff;

      this.status(`Snapshot ${file.name} loaded`);
    } else if (parsed && parsed.type === 'tap') {
      // TAP handling not wired automatically; keep for future
      this.status('TAP loaded (not auto-started)');
      this._lastTap = parsed;
    } else {
      this.status('Unknown file loaded');
    }
  }

  async _createCore(romBuffer = null) {
    console.log('[Emulator] _createCore: romBuffer', romBuffer);
    this.memory = new Memory({ model: '48k', romBuffer });
    this.cpu = new Z80(this.memory);
    
    // CPU debug callback and peripheral initialization moved to helpers
    if (this._debugEnabled) this._setupCpuDebug();

    this.memory.attachCPU(this.cpu);

    // Initialize ULA, Sound and related peripherals
    this._initPeripherals();
    
    // CRITICAL: Initialize I/O channel system for boot sequence
    this._initializeIOSystem();

    // Create IO adapter via helper to keep this method focused
    const ioAdapter = this._createIOAdapter();

    // Install debug helpers and expose useful testing API
    this._installDebugHelpers(ioAdapter);
    
    this.cpu.io = ioAdapter;
    console.log('[Emulator] _createCore: connected CPU io adapter for port 0xFE border control');

    this._enableMemoryWatch();
    this._finalizeCoreStart(romBuffer);
  }

  _createIOAdapter() {
    // Create IO adapter to connect CPU port I/O to ULA and Sound modules
    // DEBUG: Track port reads for keyboard debugging
    let _portReadDebugEnabled = false;
    let _portReadCount = 0;
    return {
      write: (port, value, tstates) => {
        // Track port write for debug API
        this._trackPortWrite(port, value);
        // Route port 0xFE to ULA for border control
        if ((port & 0xFF) === 0xFE) {
          if (this.ula && typeof this.ula.writePort === 'function') this.ula.writePort(port, value);
        }
        // Route other ports to sound if needed
        if (this.sound && typeof this.sound.writePort === 'function') {
          this.sound.writePort(port, value, tstates);
        }
      },
      read: (port) => {
        // Route port 0xFE to ULA for keyboard reading
        if ((port & 0xFF) === 0xFE) {
          const result = this.ula && typeof this.ula.readPort === 'function' ? this.ula.readPort(port) : 0xFF;
          // Debug: log keyboard port reads when enabled and key pressed (result != 0xFF)
          if (_portReadDebugEnabled && (result & 0x1F) !== 0x1F) {
            console.log(`[IO] Port read 0x${port.toString(16)} → 0x${result.toString(16)} (key detected!)`);
          }
          _portReadCount++;
          return result;
        }
        return 0xFF; // Default for unhandled ports
      },
      // Debug helper to enable verbose port read logging
      enableDebug: (enabled) => { _portReadDebugEnabled = enabled; },
      getReadCount: () => _portReadCount
    };
  }

  _installDebugHelpers(ioAdapter) {
    // Add ROM visibility verification to debug API
    // Ensure __ZX_DEBUG__ exists before accessing it
    if (!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {};
    window.__ZX_DEBUG__.isROMVisible = (address = 0) => {
      // Checks if the byte at address matches the ROM byte
      if (!this.memory || !window.spec48 || !window.spec48.bytes) return false;
      if (address < 0 || address >= window.spec48.bytes.length) return false;
      return this.memory.read(address) === window.spec48.bytes[address];
    };

    // Add keyboard debug helpers to __ZX_DEBUG__ so they're always available
    window.__ZX_DEBUG__.pressKey = (key) => {
      if (this.input && typeof this.input.pressKey === 'function') {
        this.input.pressKey(key);
        if (typeof this._applyInputToULA === 'function') this._applyInputToULA();
        console.log(`[__ZX_DEBUG__] pressKey('${key}') - matrix synced to ULA`);
        return true;
      }
      console.warn('[__ZX_DEBUG__] pressKey: input not available');
      return false;
    };

    window.__ZX_DEBUG__.releaseKey = (key) => {
      if (this.input && typeof this.input.releaseKey === 'function') {
        this.input.releaseKey(key);
        if (typeof this._applyInputToULA === 'function') this._applyInputToULA();
        console.log(`[__ZX_DEBUG__] releaseKey('${key}')`);
        return true;
      }
      return false;
    };

    window.__ZX_DEBUG__.typeKey = async (key, holdMs = 100) => {
      window.__ZX_DEBUG__.pressKey(key);
      await new Promise(r => setTimeout(r, holdMs));
      window.__ZX_DEBUG__.releaseKey(key);
    };

    window.__ZX_DEBUG__.resetKeyboard = () => {
      if (this.input && typeof this.input.reset === 'function') {
        this.input.reset();
        if (typeof this._applyInputToULA === 'function') this._applyInputToULA();
        console.log('[__ZX_DEBUG__] keyboard reset');
      }
    };

    window.__ZX_DEBUG__.getKeyMatrix = () => ({
      input: this.input?.matrix ? Array.from(this.input.matrix).map(v => '0x' + v.toString(16).padStart(2, '0')) : null,
      ula: this.ula?.keyMatrix ? Array.from(this.ula.keyMatrix).map(v => '0x' + v.toString(16).padStart(2, '0')) : null
    });

    window.__ZX_DEBUG__.enableKeyboardDebug = () => {
      if (this.setKeyboardDebug) this.setKeyboardDebug(true);
      if (this.ula) this.ula.setDebug(true);
      if (this.input) this.input.setDebug(true);
      if (ioAdapter && ioAdapter.enableDebug) ioAdapter.enableDebug(true);
      console.log('[__ZX_DEBUG__] keyboard debug ENABLED - watch for [Input], [ULA], and [IO] logs');
    };

    window.__ZX_DEBUG__.disableKeyboardDebug = () => {
      if (this.setKeyboardDebug) this.setKeyboardDebug(false);
      if (this.ula) this.ula.setDebug(false);
      if (this.input) this.input.setDebug(false);
      if (ioAdapter && ioAdapter.enableDebug) ioAdapter.enableDebug(false);
      console.log('[__ZX_DEBUG__] keyboard debug DISABLED');
    };

    window.__ZX_DEBUG__.testKeyboardPath = async (key = 'l') => {
      console.log('=== KEYBOARD PATH TEST ===' );
      console.log('1. Initial state:');
      console.log('   Input matrix:', window.__ZX_DEBUG__.getKeyMatrix().input);
      console.log('   ULA keyMatrix:', window.__ZX_DEBUG__.getKeyMatrix().ula);

      console.log(`2. Pressing key '${key}'...`);
      window.__ZX_DEBUG__.pressKey(key);
      console.log('   Input matrix after press:', window.__ZX_DEBUG__.getKeyMatrix().input);
      console.log('   ULA keyMatrix after press:', window.__ZX_DEBUG__.getKeyMatrix().ula);

      console.log('3. Testing direct port read (0xBFFE for row 6 where L lives):');
      if (this.ula && typeof this.ula.readPort === 'function') {
        const portResult = this.ula.readPort(0xBFFE);
        console.log(`   ULA.readPort(0xBFFE) = 0x${portResult.toString(16)} (expect bit 1 = 0 for L key)`);
        console.log(`   Binary: ${portResult.toString(2).padStart(8, '0')}`);
        if ((portResult & 0x02) === 0) {
          console.log('   ✓ L key IS detected in port read!');
        } else {
          console.log('   ✗ L key NOT detected - check ULA.readPort implementation');
        }
      }

      console.log('4. Holding for 500ms to let ROM poll...');
      await new Promise(r => setTimeout(r, 500));

      console.log('5. Releasing key...');
      window.__ZX_DEBUG__.releaseKey(key);
      console.log('   Input matrix after release:', window.__ZX_DEBUG__.getKeyMatrix().input);
      console.log('=== END TEST ===');
    };

    // Capture a screenshot after pressing a key to verify ROM interaction with canvas
    window.__ZX_DEBUG__.testKeyboardAndScreenshot = async ({ key = 'l', holdMs = 500, waitMs = 500, download = false, filename = null } = {}) => {
      console.log('=== KEYBOARD SCREENSHOT TEST ===');
      try {
        const canvas = document.getElementById('screen');
        if (!canvas) { console.error('[__ZX_DEBUG__] canvas #screen not found'); return null; }
        try { canvas.focus(); } catch { /* ignore */ }

        console.log(`[__ZX_DEBUG__] Pressing '${key}' for ${holdMs}ms`);
        if (typeof window.__ZX_DEBUG__.pressKey === 'function') window.__ZX_DEBUG__.pressKey(key);
        else if (window.emu && window.emu.input && typeof window.emu.input.pressKey === 'function') window.emu.input.pressKey(key);
        if (typeof window.emu !== 'undefined' && typeof window.emu._applyInputToULA === 'function') window.emu._applyInputToULA();

        await new Promise(r => setTimeout(r, holdMs));

        if (typeof window.__ZX_DEBUG__.releaseKey === 'function') window.__ZX_DEBUG__.releaseKey(key);
        else if (window.emu && window.emu.input && typeof window.emu.input.releaseKey === 'function') window.emu.input.releaseKey(key);

        console.log('[__ZX_DEBUG__] Waiting for ROM to poll and render...');
        await new Promise(r => setTimeout(r, waitMs));

        // Capture canvas image
        const dataUrl = canvas.toDataURL('image/png');
        window.__ZX_DEBUG__.lastKeyboardScreenshot = dataUrl;
        console.log('[__ZX_DEBUG__] Screenshot captured (dataURL stored in window.__ZX_DEBUG__.lastKeyboardScreenshot)');

        if (download) {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = filename || `keyboard-${key}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          console.log('[__ZX_DEBUG__] Screenshot downloaded as', a.download);
        }

        // Return diagnostics summary
        return {
          key,
          holdMs,
          waitMs,
          matrices: window.__ZX_DEBUG__.getKeyMatrix(),
          lastKeyDetected: window.__KEYBOARD_DEBUG__?.lastKeyDetected || null,
          lastPortReadsTail: (window.__TEST__ && window.__TEST__.portReads) ? window.__TEST__.portReads.slice(-10) : null,
          screenshotPreview: dataUrl.slice(0, 128) + '...'
        };
      } catch (e) {
        console.error('[__ZX_DEBUG__] testKeyboardAndScreenshot failed', e);
        return null;
      }
    };
  }

  _enableMemoryWatch() {
    this._memWrites = [];
    try {
      this.memory.enableStackWatch(0x4000, 0x5AFF, (evt) => {
        try {
          try { evt.pc = this.cpu ? this.cpu.PC : undefined; } catch { evt.pc = undefined; }
          try { evt.regs = this.cpu && typeof this.cpu.getRegisters === 'function' ? this.cpu.getRegisters() : undefined; } catch { evt.regs = undefined; }
          if (this._debugEnabled) this._memWrites.push(evt);
          try { if (typeof window !== 'undefined' && window.__ZX_DEBUG__) window.__ZX_DEBUG__.memWrites = this._memWrites; } catch { /* ignore */ }
        } catch { /* best effort */ }
      });
      console.log('[Emulator] _createCore: enabled mem write watch for 0x4000-0x5AFF');
    } catch { /* ignore if memory doesn't support watch */ }
  }

  _initPeripherals() {
    // ULA with DEFERRED RENDERING ENABLED BY DEFAULT (JSSpeccy3-style)
    // This is the proper fix for the red lines bug - render from frame buffer
    // captured at END of frame, not live memory during execution
    this.ula = new ULA(this.memory, this.canvas, { useDeferredRendering: true });
    this.ula.attachCPU(this.cpu); // CRITICAL: Connect ULA to CPU for interrupt generation
    this.sound = new Sound();
  }

  _setupCpuDebug() {
    this.cpu.debugCallback = (opcode, pc) => {
      // CRITICAL: Use the PC value passed to callback (current instruction address)
      // NOT this.cpu.PC which would be the NEXT instruction address
      this._trackOpcodeExecution(opcode, pc);
      try { if (typeof window !== 'undefined') window.__LAST_PC__ = pc; } catch { /* ignore */ }
    };
    // Disable verbose debugging to prevent console spam
    this.cpu._debugVerbose = false;
  }

  _finalizeCoreStart(romBuffer) {
    console.log('[Emulator] _createCore: memory', this.memory, 'cpu', this.cpu, 'ula', this.ula);

    try { if (typeof window !== 'undefined') window.__TEST__ = window.__TEST__ || window.TEST || {}; } catch { /* ignore */ }

    try { this.input.emulator = this; } catch { /* best-effort */ }

    try { if (typeof window !== 'undefined') { window.emu = window.emu || this; window.emulator = window.emulator || this; } } catch { /* ignore */ }

    this.input.start();

    try { if (typeof window !== 'undefined') window.__TEST__.frameGenerated = window.__TEST__.frameGenerated || function() {}; } catch { /* ignore */ }

    try {
      if (this.canvas && this.input) {
        const forwardDown = (e) => { try { this.input._keydown(e); } catch { /* ignore */ } };
        const forwardUp = (e) => { try { this.input._keyup(e); } catch { /* ignore */ } };
        this.canvas.addEventListener('keydown', forwardDown, { capture: true });
        this.canvas.addEventListener('keyup', forwardUp, { capture: true });
        try { if (typeof window !== 'undefined' && window.__TEST__) { window.__TEST__.inputListeners = window.__TEST__.inputListeners || {}; window.__TEST__.inputListeners.canvas = true; } } catch { /* ignore */ }
        if (this._debug) console.log('[Emulator] Canvas key forwarding attached');
      }
    } catch { /* ignore */ }

    if (romBuffer) this.romBuffer = romBuffer.slice ? romBuffer.slice(0) : romBuffer;

    console.log('[Emulator] Initial render deferred until emulator loop or CHARS population');
    try { setTimeout(() => { if (this.canvas && typeof this.canvas.focus === 'function') { this.canvas.focus(); try { if (typeof window !== 'undefined' && window.__TEST__) window.__TEST__.canvasFocused = true; } catch { /* ignore */ } } }, 0); } catch { /* ignore */ }
  }

  async loadROM(arrayBuffer) {
    // initialize core with given ROM
    await this._createCore(arrayBuffer);
    // Boot PC typically 0x0000 (ROM entry)
    this.cpu.reset();
    // Ensure border color is set to white at boot (OUT 0xFE, 0x07)
    if (this.cpu && this.cpu.io && typeof this.cpu.io.write === 'function') {
      this.cpu.io.write(0xFE, 0x07, this.cpu.tstates);
    }
    // attach ULA keyboard matrix snapshot
    this._applyInputToULA();
  }

  _applyInputToULA() {
    // ULA expects 8 bytes, active-low; Input.matrix uses 5-bit rows (1=up). Merge into 8-bit rows.
    for (let r = 0; r < 8; r++) {
      const rowVal = (this.input.matrix && this.input.matrix[r] != null) ? this.input.matrix[r] & 0x1f : 0x1f;
      // place into low 5 bits; set upper bits to 1 (bits 5-7 = 1)
      const full = (rowVal & 0x1f) | 0b11100000;
      if (this.ula && this.ula.keyMatrix) this.ula.keyMatrix[r] = full;
    }

    // Test hook: record last applied key matrix for diagnostics
    try { if (typeof window !== 'undefined' && window.__TEST__ && this.ula && this.ula.keyMatrix) window.__TEST__.lastAppliedKeyMatrix = Array.from(this.ula.keyMatrix); } catch { /* ignore */ }
    
    if (this._keyboardDebug) {
      const pressed = [];
      for (let r = 0; r < 8; r++) {
        if (this.ula && this.ula.keyMatrix && this.ula.keyMatrix[r] !== 0xff) {
          pressed.push(`row${r}=0x${this.ula.keyMatrix[r].toString(16)}`);
        }
      }
      if (pressed.length > 0) {
        console.log(`[Emulator] _applyInputToULA: ${pressed.join(', ')}`);
      }
    }
  }

  start() {
    if (!this.cpu || !this.memory) { console.warn('[Emulator] start: CPU or memory missing'); return; }
    if (this._running) { console.warn('[Emulator] start: already running'); return; }
    this._running = true;
    this._lastTime = performance.now();
    this._acc = 0;
    this.status('running');
    this._loop = this._loop.bind(this);
    
    // Always sync keyboard state when starting
    this._applyInputToULA();
    
    // Headless browser compatibility: use setTimeout fallback if requestAnimationFrame fails
    try {
      this._rafId = requestAnimationFrame(this._loop);
      // Test if requestAnimationFrame is actually working
      setTimeout(() => {
        if (this._running && !this._fallbackUsed) {
          // Check if we're actually getting frame callbacks
          const currentTime = performance.now();
          if (currentTime - this._lastTime > 100) { // No frames for 100ms
            this._useTimeoutFallback();
          }
        }
      }, 200);
    } catch (e) {
      console.warn('[Emulator] requestAnimationFrame failed, using setTimeout fallback:', e);
      this._useTimeoutFallback();
    }
  }
  
  _useTimeoutFallback() {
    if (this._fallbackUsed) return;
    this._fallbackUsed = true;
    console.log('[Emulator] Using setTimeout fallback for headless browser compatibility');
    
    const fallbackLoop = () => {
      if (!this._running) return;
      const now = performance.now();
      this._loop(now);
      // Use 16ms timeout (approximately 60fps) for smooth emulation
      this._rafId = setTimeout(fallbackLoop, 16);
    };
    
    fallbackLoop();
  }

  pause() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) {
      if (this._fallbackUsed) {
        clearTimeout(this._rafId);
      } else {
        cancelAnimationFrame(this._rafId);
      }
    }
    this._rafId = null;
    this.status('paused');
  }

  reset() {
    if (!this.memory || !this.cpu) return;
    
    // Clear debug state first to prevent race conditions
    this._resetDebugState();
    
    // Reset keyboard state
    if (this.input) this.input.reset();
    
    this.memory.reset();
    this.cpu.reset();
    if (this.romBuffer) this.memory.loadROM(this.romBuffer);
    
    // Re-initialize debug hooks after CPU reset
    if (this._debugEnabled && this.cpu) {
      this.cpu.debugCallback = (opcode, pc) => {
        // CRITICAL: Use the PC value passed to callback (current instruction address)
        this._trackOpcodeExecution(opcode, pc);
        if (typeof window !== 'undefined') {
          window.__LAST_PC__ = pc; // Use the actual instruction PC, not the next one
        }
      };
      // Disable verbose debugging to prevent console spam
      this.cpu._debugVerbose = false;
    }
    
    // clear ULA flash/timers
    if (this.ula) {
      this.ula.flashState = false;
      this.ula._lastFlashToggle = performance.now();
      this.ula.render();
    }
    this.status('reset');
  }

  _resetDebugState() {
    this._portWrites = [];
    this._executedOpcodes = [];
    this._lastPC = 0;
    this._bootComplete = false;
    if (typeof window !== 'undefined') {
      window.__LAST_PC__ = 0;
      // Clear PC watcher history
      if (window.__PC_WATCHER__) {
        window.__PC_WATCHER__.history = [];
      }
      // Reset CPU boot tracking
      if (this.cpu && this.cpu._visitedBootAddresses) {
        this.cpu._visitedBootAddresses.clear();
      }
    }
  }

  // NOTE: _initializeIOSystem() was REMOVED
  // 
  // The previous implementation was INCORRECTLY writing to 0x5C36 (CHARS system variable)
  // instead of the proper CHANS address at 0x5C4F. This corrupted the character set pointer,
  // causing the © symbol (character 0x7F) not to display correctly.
  //
  // ZX Spectrum System Variables (correct addresses):
  // - 0x5C36-0x5C37: CHARS - Character set address - 256 (should be 0x3C00 for ROM charset)
  // - 0x5C4F-0x5C50: CHANS - Channel information area
  //
  // The ROM properly initializes all system variables during its boot sequence.
  // Pre-initializing them here was causing conflicts with the ROM's initialization.
  _initializeIOSystem() {
    // Let the ROM handle all system variable initialization
    // This ensures the character set pointer (CHARS at 0x5C36) is set correctly
    // to 0x3C00, which points to the ROM character set at 0x3D00 minus 256
    if (this._debug && typeof console !== 'undefined') {
      console.log('[Emulator] Letting ROM handle system variable initialization');
    }
  }

  _loop(now) {
    if (!this._running) return;
    const dt = now - this._lastTime;
    this._lastTime = now;
    this._acc += dt;

    // Run one or more 50Hz frames if enough time elapsed
    while (this._acc >= FRAME_MS) {
      // sync input matrix to ULA
      this._applyInputToULA();

      // Run CPU for a full frame worth of t-states with interrupt generation
      if (this.cpu && typeof this.cpu.runFor === 'function') {
        this.cpu.runFor(TSTATES_PER_FRAME);
        
        // QUICK FIX: Synchronous interrupt generation at frame boundary
        // This replaces the async setTimeout approach that caused timing issues
        if (this.ula) {
          this.ula.updateInterruptState();
          this.ula.generateInterruptSync(); // Use synchronous interrupt
        }
      }

      // QUICK FIX: Skip rendering during boot frames to let ROM fully initialize
      if (this._bootFramesRemaining > 0) {
        // If display memory writes occur during boot, render once so users can see progress
        try {
          if (this._memWrites && this._memWrites.length > (this._lastMemWritesLen || 0)) {
            const newWrites = this._memWrites.slice(this._lastMemWritesLen || 0);
            const madeDisplayWrite = newWrites.some(w => {
              try {
                return Object.values(w).some(v => (typeof v === 'number' && v >= 0x4000 && v <= 0x5AFF));
              } catch (e) { return false; }
            });
            if (madeDisplayWrite && this.ula) {
              try { this.ula.render(); } catch (e) { void e; }
            }
            this._lastMemWritesLen = this._memWrites.length;
          }
        } catch (e) { void e; }

        this._bootFramesRemaining--;
        if (this._bootFramesRemaining === 0) {
          console.log('[Emulator] Boot frames complete, starting normal rendering');
        }
      } else if (this.ula) {
        this.ula.render();
      }

      // Detect CHARS (0x5C36..0x5C37) changes and schedule a re-render/check loop when ROM sets it
      try {
        const lo = this.memory.read(0x5C36);
        const hi = this.memory.read(0x5C37);
        const chars = (hi << 8) | lo;
        if (this._lastChars !== chars) {
          // record the change into test-visible history
          try { window.__TEST__ = window.__TEST__ || {}; window.__TEST__.charsHistory = window.__TEST__.charsHistory || []; window.__TEST__.charsHistory.push({ t: Date.now(), chars, pc: (window.__LAST_PC__ || null), tstates: (this.cpu ? this.cpu.tstates : null) }); if (window.__TEST__.charsHistory.length > 128) window.__TEST__.charsHistory.shift(); } catch (e) { /* ignore */ }

          this._lastChars = chars;
          // When CHARS becomes non-zero (ROM has initialized it), ensure ULA re-renders and verify the ROM-copied glyph bytes are present
          // Some ROMs set CHARS first and then copy glyph bytes slightly later. Instead of a blind set of renders, poll the glyph bytes for 0x7F
          // and keep rendering until we observe non-zero glyph data (or exhaust attempts).
          if (chars !== 0 && this.ula) {
            // Helper to check glyph bytes for 0x7F
            const checkGlyph = () => {
              try {
                const lo2 = this.memory.read(0x5C36);
                const hi2 = this.memory.read(0x5C37);
                const ptr = ((hi2 << 8) | lo2) || 0x3C00;
                const glyphBytes = [];
                for (let i = 0; i < 8; i++) {
                  glyphBytes.push(this.memory.read((ptr + 0x7F * 8 + i) & 0xffff));
                }
                const populated = glyphBytes.some(b => b !== 0 && typeof b === 'number');
                // Record for diagnostics so tests can inspect attempts
                try { window.__TEST__ = window.__TEST__ || {}; window.__TEST__.charsCheck = window.__TEST__.charsCheck || []; window.__TEST__.charsCheck.push({ t: Date.now(), ptr, glyphBytes, populated }); if (window.__TEST__.charsCheck.length > 32) window.__TEST__.charsCheck.shift(); } catch (e) { /* best-effort */ }
                if (populated) {
                  try { this.ula.render(); } catch (e) { /* ignore */ }
                  return true;
                }
              } catch (e) { /* ignore */ }
              try { this.ula.render(); } catch (e) { /* ignore */ }
              return false;
            };

            // Immediate check + schedule retries at increasing delays
            const delays = [0, 20, 60, 120, 250, 500];
            let done = false;
            for (const d of delays) {
              setTimeout(() => {
                if (done) return;
                try {
                  const ok = checkGlyph();
                  if (ok) done = true;
                } catch (e) { /* ignore */ }
              }, d);
            }
          }
        }
      } catch (e) { void e; }

      // Optionally update sound using CPU tstates / port toggles (best-effort)
      // Sound integration requires CPU OUT implementation; here we provide a hook
      if (this.sound && this.cpu && typeof this.sound.notifyToggleAt === 'function') {
        // best-effort: use cpu.tstates to allow sound module to compute frequency
        this.sound.notifyToggleAt(this.cpu.tstates || 0);
      }

      this._acc -= FRAME_MS;
    }

    this._rafId = requestAnimationFrame(this._loop);
  }

  status(msg) {
    if (this.statusEl) this.statusEl.textContent = `Status: ${msg}`;
  }
}

// Auto-initialize when DOM ready and wire UI elements
window.addEventListener('DOMContentLoaded', async () => {
  // Initialize lightweight UI helpers (non-invasive)
  try { await import('./ui-keyword.mjs').then(m => m.initKeywordUI && m.initKeywordUI()); } catch (e) { /* ignore */ }

  // Ensure required elements exist
  const canvas = document.getElementById('screen');
  if (!canvas) return;

  const emu = new Emulator({ canvas });

  // Initialize ROM selector (UI) and wire selection handler
  try {
    romManager.initRomSelector('#rom-select', async (id) => {
      try {
        const data = await romManager.loadRom(id);
        await emu.loadROM(data.rom);
        try { romManager.applyMemoryConfig(emu.memory, data.metadata, data.rom); } catch { /* ignore */ }
        emu.status(`selected ROM: ${id}`);
      } catch (e) {
        console.error('ROM selection failed', e);
        emu.status('ROM selection failed');
      }
    });
    const sel = document.getElementById('rom-select');
    if (sel) sel.value = 'spec48';
  } catch { /* ignore */ }

  // --- Diagnostic overlay: on-page debug panel for ROM/CHARS/canvas checks ---
  try {
    // Provide a global helper so other UI elements (Reset button etc.) can trigger cache-clear + reload
    window.__EMU_clearCacheAndReload = async function() {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) try{ await r.unregister(); } catch { /* ignore */ } }
        if (window.caches && caches.keys) { const keys = await caches.keys(); for (const k of keys) await caches.delete(k); }
        // Use location.reload() — browsers may ignore true param but call reload
        location.reload(true);
      } catch (e) { try{ document.getElementById('__emu_diag_out').textContent = 'Cache clear failed: ' + String(e); }catch{ /* ignore */ } }
    };
    const dbgPanel = document.createElement('div');
    dbgPanel.id = '__emu_debug_panel';
    // Position above on-screen keyboard to avoid overlap; reduce width slightly for better fit
    Object.assign(dbgPanel.style, { position: 'fixed', right: '12px', bottom: '120px', background: '#111', color: '#fff', padding: '10px', border: '1px solid #333', fontFamily: 'monospace', zIndex: 9999, width: '300px', maxHeight: '50vh', overflow: 'auto', fontSize: '12px', borderRadius: '4px' });
    dbgPanel.innerHTML = `
      <div id="__emu_diag_header" style="cursor:move; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-weight:bold;">Emu Diagnostics</div>
        <button id="__emu_diag_close" style="background:#222;color:#fff;border:0;padding:2px 6px;cursor:pointer">×</button>
      </div>
      <div id="__emu_diag_out" style="white-space:pre-wrap; color:#ddd; margin-bottom:8px; min-height:40px;">Ready</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="__emu_btn_run" style="padding:6px">Run Diag</button>
        <button id="__emu_btn_force" style="padding:6px">Force render</button>
        <button id="__emu_btn_reveal" style="padding:6px">Reveal glyph</button>
        <button id="__emu_btn_force_draw" style="padding:6px">Force draw ©</button>
        <button id="__emu_btn_clearcache" style="padding:6px">Clear cache & reload</button>
        <button id="__emu_btn_input_status" style="padding:6px">Input status</button>
      </div>
      <div id="__emu_input_status" style="display:none;margin-top:8px;padding:6px;background:#0b0b0b;border:1px solid #222;color:#bfb; font-size:11px;">Last key: <span id="__emu_input_last">(none)</span><br>Hidden input focused: <span id="__emu_input_focused">false</span></div>`;
    document.body.appendChild(dbgPanel);

    // Add a persistent toggle control into the UI controls area
    try {
      const controls = document.querySelector('.controls');
      if (controls) {
        const label = document.createElement('label');
        label.style.color = '#ccc';
        label.style.marginTop = '6px';
        label.innerHTML = `<input id="__emu_diag_toggle" type="checkbox" style="margin-right:6px;"> Show Diagnostics`;
        controls.appendChild(label);

        const toggle = label.querySelector('#__emu_diag_toggle');
        const savedVisible = localStorage.getItem('__emu_diag_visible');
        const isVisible = savedVisible === null ? true : (savedVisible === 'true');
        toggle.checked = isVisible;
        if (!isVisible) dbgPanel.style.display = 'none';
        toggle.addEventListener('change', (e) => {
          const show = Boolean(e.target.checked);
          dbgPanel.style.display = show ? 'block' : 'none';
          localStorage.setItem('__emu_diag_visible', String(show));
        });
      }
    } catch (e) { /* non-critical */ }

    // Drag/persist handlers
    try {
      // Restore saved position if available
      const posJson = localStorage.getItem('__emu_diag_pos');
      if (posJson) {
        const pos = JSON.parse(posJson);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') {
          dbgPanel.style.left = pos.left + 'px';
          dbgPanel.style.top = pos.top + 'px';
          dbgPanel.style.right = 'auto';
          dbgPanel.style.bottom = 'auto';
        }
      }

      const header = document.getElementById('__emu_diag_header');
      const closeBtn = document.getElementById('__emu_diag_close');
      if (closeBtn) closeBtn.addEventListener('click', () => {
        dbgPanel.style.display = 'none';
        localStorage.setItem('__emu_diag_visible', 'false');
        const t = document.getElementById('__emu_diag_toggle'); if (t) t.checked = false;
      });

      // Input status toggle button
      const statusBtn = document.getElementById('__emu_btn_input_status');
      const statusDiv = document.getElementById('__emu_input_status');
      const lastSpan = document.getElementById('__emu_input_last');
      const focusedSpan = document.getElementById('__emu_input_focused');
      if (statusBtn && statusDiv) {
        statusBtn.addEventListener('click', () => {
          const isNowVisible = (statusDiv.style.display === 'none' || !statusDiv.style.display) ? true : false;
          statusDiv.style.display = isNowVisible ? 'block' : 'none';
          // Immediately update with current values to avoid race with event dispatch
          try {
            const debug = window.__ZX_DEBUG__ || {};
            if (lastSpan) lastSpan.textContent = debug.lastCapturedKey || '(none)';
            const hiddenFocused = !!(debug.hiddenInputFocused || (document.activeElement && document.activeElement.id === '__emu_hidden_input'));
            if (focusedSpan) focusedSpan.textContent = hiddenFocused ? 'true' : 'false';
          } catch (e) { /* ignore */ }
        });
      }

      // Listen for input status events to update display
      try {
        document.addEventListener('emu-input-status', (ev) => {
          try {
            const d = ev && ev.detail ? ev.detail : {};
            if (lastSpan) lastSpan.textContent = d.lastKey || '(none)';
            if (focusedSpan) focusedSpan.textContent = d.hiddenFocused ? 'true' : 'false';
          } catch (e) { /* ignore */ }
        });
      } catch (e) { /* non-critical */ }

      let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
      const onMove = (clientX, clientY) => {
        const dx = clientX - startX; const dy = clientY - startY;
        dbgPanel.style.left = (startLeft + dx) + 'px';
        dbgPanel.style.top = (startTop + dy) + 'px';
        dbgPanel.style.right = 'auto'; dbgPanel.style.bottom = 'auto';
      };

      const onMouseMove = (ev) => { if (!dragging) return; onMove(ev.clientX, ev.clientY); };
      const onMouseUp = () => { if (!dragging) return; dragging = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); try { localStorage.setItem('__emu_diag_pos', JSON.stringify({ left: parseInt(dbgPanel.style.left, 10) || 0, top: parseInt(dbgPanel.style.top, 10) || 0 })); } catch { /* ignore */ } };
      header.addEventListener('mousedown', (ev) => { dragging = true; startX = ev.clientX; startY = ev.clientY; const r = dbgPanel.getBoundingClientRect(); startLeft = r.left; startTop = r.top; document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); ev.preventDefault(); });

      // Touch support
      const onTouchMove = (ev) => { if (!dragging) return; if (ev.touches && ev.touches[0]) onMove(ev.touches[0].clientX, ev.touches[0].clientY); ev.preventDefault(); };
      const onTouchEnd = () => { if (!dragging) return; dragging = false; document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); try { localStorage.setItem('__emu_diag_pos', JSON.stringify({ left: parseInt(dbgPanel.style.left, 10) || 0, top: parseInt(dbgPanel.style.top, 10) || 0 })); } catch { /* ignore */ } };
      header.addEventListener('touchstart', (ev) => { dragging = true; if (ev.touches && ev.touches[0]) { startX = ev.touches[0].clientX; startY = ev.touches[0].clientY; const r = dbgPanel.getBoundingClientRect(); startLeft = r.left; startTop = r.top; } document.addEventListener('touchmove', onTouchMove, { passive: false }); document.addEventListener('touchend', onTouchEnd); ev.preventDefault(); });
    } catch (e) { /* non-critical */ }

    const gatherDiag = async () => {
      const out = {};
      out.time = (new Date()).toISOString();
      out.debugAvailable = Boolean(window.__ZX_DEBUG__);

      try { await this._gatherRomInfo(out); } catch (e) { out.romErr = String(e); }
      try { this._gatherCharsInfo(out); } catch (e) { out.CHARS = 'err'; }
      try { this._gatherGlyph(out); } catch (e) { out.glyphErr = String(e); }
      try { this._gatherScreenScan(out); } catch (e) { out.screenScanErr = String(e); }
      try { this._gatherCanvasCheck(out); } catch (e) { out.canvasErr = String(e); }

      return out;
    };

    // Helper: rom checks
    _gatherRomInfo(out) {
      out.romHas7F = false;
      out.romOffsets = [];
      if (typeof window.__ZX_DEBUG__?.readROM === 'function') {
        for (let i = 0x1530; i < 0x1550; i++) { if (window.__ZX_DEBUG__.readROM(i) === 0x7F) { out.romHas7F = true; out.romOffsets.push(i); } }
      }
    }

    // Helper: CHARS info
    _gatherCharsInfo(out) {
      out.CHARS = window.__ZX_DEBUG__?.peekMemory ? window.__ZX_DEBUG__.peekMemory(0x5C36,2) : null;
      out.CHARSptr = (Array.isArray(out.CHARS) ? ((out.CHARS[1]<<8) | out.CHARS[0]) : null);
      out.emu_lastChars = (window.emulator && typeof window.emulator._lastChars !== 'undefined') ? window.emulator._lastChars : null;
    }

    // Helper: glyph bytes
    _gatherGlyph(out) {
      const ptr = out.CHARSptr || 0x3C00;
      out.glyph = [];
      for (let i = 0; i < 8; i++) {
        let v = null;
        try { v = window.__ZX_DEBUG__?.readRAM ? window.__ZX_DEBUG__.readRAM((ptr + 0x7F*8 + i) & 0xffff) : (window.__ZX_DEBUG__?.readMemory ? window.__ZX_DEBUG__.readMemory((ptr + 0x7F*8 + i) & 0xffff) : null); } catch(e) { v = null; }
        out.glyph.push(v);
      }
    }

    // Helper: screen RAM scan
    _gatherScreenScan(out) {
      out.screenHas7F = false;
      if (window.__ZX_DEBUG__?.readRAM) {
        for (let col = 0; col < 32; col++) {
          for (let r = 184; r < 192; r++) {
            const rel = ((r & 0xC0) << 5) + ((r & 0x07) << 8) + ((r & 0x38) << 2) + col;
            if (window.__ZX_DEBUG__.readRAM(rel) === 0x7F) out.screenHas7F = true;
          }
        }
      }
    }

    // Helper: canvas pixel check
    _gatherCanvasCheck(out) {
      out.canvasNonBg = false;
      const canvas = document.getElementById('screen');
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const sx = Math.max(0, Math.floor(w * 0.05));
        const sy = Math.max(0, Math.floor(h * 0.86));
        const sw = Math.min(32, w - sx), sh = Math.min(24, h - sy);
        const img = ctx.getImageData(sx, sy, sw, sh);
        const d = img.data;
        const br = d[0], bg = d[1], bb = d[2];
        for (let i = 0; i < d.length; i += 4) { if (d[i] !== br || d[i+1] !== bg || d[i+2] !== bb) { out.canvasNonBg = true; break; } }
      }
    }

    const runAndUpdate = async () => {
      const out = await gatherDiag();
      const el = document.getElementById('__emu_diag_out');
      el.textContent = JSON.stringify(out, null, 2);
      return out;
    };

    document.getElementById('__emu_btn_run').addEventListener('click', async () => { try { await runAndUpdate(); } catch (e) { document.getElementById('__emu_diag_out').textContent = 'Diag failed: ' + String(e); } });
    document.getElementById('__emu_btn_force').addEventListener('click', async () => { try {
      if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { for (let i=0;i<4;i++){ window.emulator.ula.render(); await new Promise(r=>requestAnimationFrame(r)); } }
      await runAndUpdate();
    } catch (e) { document.getElementById('__emu_diag_out').textContent = 'Force failed: ' + String(e); } });

    // Reveal glyph helper: if ROM contains 0x7F and screen RAM uses 0x7F but canvas is unchanged,
    // allow the user to force attribute overrides on the bottom text area so glyph becomes visible.
    document.getElementById('__emu_btn_reveal').addEventListener('click', async () => {
      try {
        const outEl = document.getElementById('__emu_diag_out');
        if (!window.emulator || !window.__ZX_DEBUG__) { outEl.textContent = 'Emulator/debug API not available'; return; }
        const dbg = window.__ZX_DEBUG__;
        // Find columns in rows 184..191 that contain 0x7F
        const foundCols = [];
        for (let col = 0; col < 32; col++) {
          for (let r = 184; r < 192; r++) {
            const rel = ((r & 0xC0) << 5) + ((r & 0x07) << 8) + ((r & 0x38) << 2) + col;
            const v = dbg.readRAM(rel);
            if (v === 0x7F) { foundCols.push(col); break; }
          }
        }
        if (foundCols.length === 0) { outEl.textContent = 'No 0x7F character found in bottom rows'; return; }

        // Apply attribute override (white ink on black paper = 0x07) for detected columns
        const attrRowBase = 0x5800 + (Math.floor(184 / 8) * 32);
        const changed = [];
        for (const c of foundCols) {
          const addr = attrRowBase + c;
          try { window.emulator.memory.write(addr, 0x07); changed.push({ addr: addr.toString(16), val: 0x07 }); } catch (e) { /* ignore */ }
        }

        // Force a few renders to update canvas and then refresh diag
        if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') {
          for (let i = 0; i < 4; i++) { window.emulator.ula.render(); await new Promise(r => requestAnimationFrame(r)); }
        }
        outEl.textContent = JSON.stringify({ revealedCols: foundCols, changed }, null, 2);
        await runAndUpdate();
      } catch (e) { document.getElementById('__emu_diag_out').textContent = 'Reveal failed: ' + String(e); }
    });

    document.getElementById('__emu_btn_force_draw').addEventListener('click', async () => {
      try {
        const outEl = document.getElementById('__emu_diag_out');
        if (!window.emulator || !window.__ZX_DEBUG__) { outEl.textContent = 'Emulator/debug API not available'; return; }
        const dbg = window.__ZX_DEBUG__;

        // Check ROM contains 0x7F
        let romHas = false;
        for (let i = 0x1530; i < 0x1550; i++) {
          if (dbg.readROM(i) === 0x7F) { romHas = true; break; }
        }
        if (!romHas) { outEl.textContent = 'ROM does not contain 0x7F; cannot force-draw'; return; }

        // Find a target column to draw into: pick first column with non-background pixels in bottom area
        const inspect = window.__ZX_DEBUG__.inspectBottomGlyphs(184);
        let targetCol = null;
        for (const c of (inspect.cols || [])) {
          if (c.canvasShowsNonBg === true) { targetCol = c.col; break; }
        }
        if (targetCol === null) { outEl.textContent = 'No suitable column found to draw into (no non-bg columns)'; return; }

        // Write ROM glyph bytes directly into bitmap memory for the 8 rows at target column
        const charsRomGlyph = [];
        for (let i = 0; i < 8; i++) charsRomGlyph.push(dbg.readROM(0x3C00 + 0x7F * 8 + i));

        // Write into RAM bitmap addresses for each row (topRow..topRow+7)
        const topRow = 184;
        for (let row = 0; row < 8; row++) {
          const y = topRow + row;
          const y0 = y & 0x07;
          const y1 = (y & 0x38) >> 3;
          const y2 = (y & 0xC0) >> 6;
          const bitmapIndex = (y0 << 8) | (y1 << 5) | (y2 << 11) | targetCol;
          const addr = 0x4000 + bitmapIndex;
          try {
            window.emulator.memory.write(addr, charsRomGlyph[row]);
          } catch (e) { /* ignore */ }
        }

        // Set attribute to white ink on black paper (0x07)
        const attrAddr = 0x5800 + (Math.floor(184 / 8) * 32) + targetCol;
        try { window.emulator.memory.write(attrAddr, 0x07); } catch { /* ignore */ }

        // Force render to update canvas
        for (let i = 0; i < 4; i++) { if (window.emulator && window.emulator.ula && typeof window.emulator.ula.render === 'function') { window.emulator.ula.render(); await new Promise(r => requestAnimationFrame(r)); } }

        outEl.textContent = JSON.stringify({ forcedCol: targetCol, writtenGlyph: charsRomGlyph }, null, 2);
        await runAndUpdate();
      } catch (e) { document.getElementById('__emu_diag_out').textContent = 'Force-draw failed: ' + String(e); }
    });

    document.getElementById('__emu_btn_clearcache').addEventListener('click', async () => { try {
      if (typeof window !== 'undefined' && typeof window.__EMU_clearCacheAndReload === 'function') {
        await window.__EMU_clearCacheAndReload();
      } else {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) { const regs = await navigator.serviceWorker.getRegistrations(); for (const r of regs) try{ await r.unregister(); } catch { /* ignore */ } }
        if (window.caches && caches.keys) { const keys = await caches.keys(); for (const k of keys) await caches.delete(k); }
        location.reload(true);
      }
    } catch (e) { document.getElementById('__emu_diag_out').textContent = 'Cache clear failed: ' + String(e); } });

    // Auto-run once shortly after load
    setTimeout(runAndUpdate, 500);
  } catch (e) { console.warn('[Diag] overlay failed', e); }

  // Auto-load default preloaded ROM (spec48) if available
  try {
    if (typeof spec48 !== 'undefined' && spec48 && spec48.bytes) {
      console.log('[Emulator] Auto-loading spec48 ROM:', spec48.bytes.length, 'bytes');
      console.log('[Emulator] spec48 first 10 bytes:', Array.from(spec48.bytes.slice(0, 10)));
      
      // FIXED: Initialize core first, then load ROM properly
      console.log('[Emulator] Creating core and loading ROM');
      
      // Create core with spec48 ROM
      await emu.loadROM(spec48.bytes);
      
      console.log('[Emulator] ROM load completed, CPU PC:', emu.cpu.PC);
      emu.status('default ROM: spec48 loaded');
      
      // CRITICAL FIX: Auto-start the emulator after loading ROM
      console.log('[Emulator] Auto-starting emulator...');
      emu.start();
    } else {
      console.log('[Emulator] spec48 not available for auto-loading');
    }
  } catch (e) {
    console.error('Failed to auto-load default ROM', e);
    emu.status('default ROM load failed');
  }

  // Expose for console debugging
  window.emu = emu;
  // Expose as window.emulator for test compatibility
  window.emulator = emu;
  
  // Expose spec48 ROM data globally for test access
  if (typeof spec48 !== 'undefined' && spec48) {
    window.spec48 = spec48;
    console.log('[Emulator] Exposed spec48 to window.spec48');
  }
  
  // Expose debug API with enhanced reliability
  window.__ZX_DEBUG__ = {
    getRegisters: () => emu.getRegisters(),
    getPC: () => emu.getPC(),
    getCurrentPC: () => emu.getCurrentPC(), // Enhanced PC getter with fallbacks
    getAF: () => emu.getAF(),
    getBC: () => emu.getBC(),
    getDE: () => emu.getDE(),
    getHL: () => emu.getHL(),
    peekMemory: (address, length) => emu.peekMemory(address, length),
    readROM: (address) => emu.readROM(address),
    readRAM: (address) => emu.readRAM(address),
    getPortWrites: () => emu.getPortWrites(),
    getLastPortWrite: () => emu.getLastPortWrite(),
    portWrites: emu._portWrites,
    executedOpcodes: emu._executedOpcodes,
    bootComplete: () => emu._bootComplete,
    isTestMode: true,
    timing: {
      tstates: emu.cpu ? emu.cpu.tstates : 0,
      framesExecuted: Math.floor((emu.cpu ? emu.cpu.tstates : 0) / 69888)
    },
    // Enhanced reliability features
    getLastPC: () => {
      return window.__LAST_PC__ || (emu.cpu ? emu.cpu.PC : 0);
    },
    getPCHistory: () => {
      return window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.slice() : [];
    },
    getBootProgress: () => {
      if (!emu.cpu) return { visited: [], complete: false };
      const visited = Array.from(emu.cpu._visitedBootAddresses || []);
      return {
        visited,
        complete: emu._bootComplete,
        totalAddresses: emu.cpu._bootAddresses?.length || 5
      };
    },
    // Keyboard debug helpers
    getKeyboardState: () => emu.input ? emu.input.getMatrixState() : null,
    pressKey: (key) => {
      if (emu.input) {
        emu.input.pressKey(key);
        emu._applyInputToULA();
        return true;
      }
      return false;
    },
    releaseKey: (key) => {
      if (emu.input) {
        emu.input.releaseKey(key);
        emu._applyInputToULA();
        return true;
      }
      return false;
    },
    setKeyboardDebug: (enabled) => emu.setKeyboardDebug(enabled),
    resetKeyboard: () => {
      if (emu.input) {
        emu.input.reset();
        emu._applyInputToULA();
        return true;
      }
      return false;
    },

    // Diagnostic helper: perform a comprehensive inspection of the bottom text area (default topRow=184)
    // Returns per-column info: character codes, attribute byte, glyph bytes at CHARS ptr and ROM, and a simple canvas check
    inspectBottomGlyphs: (topRow = 184) => {
      try {
        if (!emu || typeof emu.readRAM !== 'function') return { error: 'emu-not-ready' };
        const cols = [];
        // read CHARS pointer (0x5C36/0x5C37)
        const lo = emu.peekMemory ? (emu.peekMemory(0x5C36,1)[0]) : emu.readRAM(0x5C36);
        const hi = emu.peekMemory ? (emu.peekMemory(0x5C37,1)[0]) : emu.readRAM(0x5C37);
        const charsPtr = ((hi << 8) | lo) || 0x3C00;

        for (let col = 0; col < 32; col++) {
          const colInfo = { col, rows: [], attrAddr: null, attrByte: null, glyphBytesAtChars: [], glyphBytesAtRom: [], glyphMatchesRom: false, canvasShowsNonBg: null };

          // collect character codes for the vertical 8 rows
          for (let r = 0; r < 8; r++) {
            const y = topRow + r;
            const rel = ((y & 0xC0) << 5) + ((y & 0x07) << 8) + ((y & 0x38) << 2) + col;
            const val = emu.readRAM(0x4000 + rel);
            colInfo.rows.push({ y, addr: (0x4000 + rel), val });
          }

          // attribute byte
          const attrAddr = 0x5800 + (Math.floor(topRow / 8) * 32) + col;
          colInfo.attrAddr = attrAddr;
          colInfo.attrByte = emu.readRAM(attrAddr);

          // glyph bytes at current CHARS pointer for code 0x7F
          for (let i = 0; i < 8; i++) colInfo.glyphBytesAtChars.push(emu.readRAM((charsPtr + 0x7F * 8 + i) & 0xffff));

          // glyph bytes at ROM 0x3C00 for reference
          for (let i = 0; i < 8; i++) colInfo.glyphBytesAtRom.push(emu.readROM((0x3C00 + 0x7F * 8 + i) & 0xffff));

          // compare
          colInfo.glyphMatchesRom = colInfo.glyphBytesAtChars.every((b, idx) => b === colInfo.glyphBytesAtRom[idx]);

          // FrameBuffer sample if available (gives rendered framebuffer bytes for the 8 rows)
          try {
            const fb = (window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer) ? window.emulator.ula.frameBuffer : null;
            colInfo.fbBytes = [];
            colInfo.fbMatchesRom = false;
            if (fb && fb.buffer) {
              const buf = fb.buffer;
              const topBorderBytes = 24 * 160;
              const lineStride = 16 + 64 + 16;
              for (let i = 0; i < 8; i++) {
                const y = topRow + i;
                const bufferPtr = topBorderBytes + y * lineStride + 16 + col * 2;
                colInfo.fbBytes.push(buf[bufferPtr]);
              }
              // if fbBytes present and rom glyph bytes are available, compare
              if (colInfo.fbBytes.length === 8 && colInfo.glyphBytesAtRom && colInfo.glyphBytesAtRom.length === 8) {
                colInfo.fbMatchesRom = colInfo.fbBytes.every((b, idx) => b === colInfo.glyphBytesAtRom[idx]);
              }
            }
          } catch (e) { colInfo.fbBytes = 'error'; colInfo.fbMatchesRom = 'error'; }

          // light-weight canvas check: sample the 8x8 area and see if all pixels equal the top-left sample (i.e., blank area)
          try {
            const canvas = document.getElementById('screen');
            if (canvas && canvas.getContext) {
              const ctx = canvas.getContext('2d');
              const xStart = 16 * 2 + col * 8; // matches FrameRenderer coordinates
              const yStart = 24 + topRow;
              const base = ctx.getImageData(xStart, yStart, 1, 1).data;
              let allSame = true;
              for (let ry = 0; ry < 8 && allSame; ry++) {
                for (let rx = 0; rx < 8; rx++) {
                  const d = ctx.getImageData(xStart + rx, yStart + ry, 1, 1).data;
                  if (d[0] !== base[0] || d[1] !== base[1] || d[2] !== base[2]) { allSame = false; break; }
                }
              }
              colInfo.canvasShowsNonBg = !allSame;
            }
          } catch (e) { colInfo.canvasShowsNonBg = 'error'; }

          cols.push(colInfo);
        }
        return { charsPtr, cols };
      } catch (e) { return { error: String(e) }; }
    },

    // Test helper: snapshot a single character column's bitmap/attr and try to match it to ROM charset
    snapshotGlyph: (col, topRow) => {
      try {
        const result = { col, topRow, bitmapAddrs: [], bitmapBytes: [], attrAddr: null, attrByte: null, fbBytes: [], romMatchAddr: null, matchToRom: false, lastPC: emu.getLastPC ? emu.getLastPC() : (emu.getPC ? emu.getPC() : 0) };
        if (!emu || !emu.peekMemory || typeof emu.readRAM !== 'function' || typeof emu.readROM !== 'function') return result;

        // Read the 8 bitmap bytes for the character vertical (8 rows)
        for (let i = 0; i < 8; i++) {
          const y = topRow + i;
          const y0 = y & 0x07;
          const y1 = (y & 0x38) >> 3;
          const y2 = (y & 0xC0) >> 6;
          const bitmapIndex = (y0 << 8) | (y1 << 5) | (y2 << 11) | col;
          const addr = 0x4000 + bitmapIndex;
          result.bitmapAddrs.push(addr);
          result.bitmapBytes.push(emu.readRAM(addr));
        }

        // Attribute byte for the character cell
        const attrAddr = 0x5800 + (Math.floor(topRow / 8) * 32) + col;
        result.attrAddr = attrAddr;
        result.attrByte = emu.readRAM(attrAddr);

        // FrameBuffer sample if available
        try {
          const emuWindow = window.emulator || window.emu;
          if (emuWindow && emuWindow.ula && emuWindow.ula.frameBuffer && emuWindow.ula.frameBuffer.buffer) {
            const buf = emuWindow.ula.frameBuffer.buffer;
            const topBorderBytes = 24 * 160;
            const lineStride = 16 + 64 + 16;
            for (let i = 0; i < 8; i++) {
              const y = topRow + i;
              const bufferPtr = topBorderBytes + y * lineStride + 16 + col * 2;
              result.fbBytes.push(buf[bufferPtr]);
            }
          }
        } catch (e) { /* ignore */ }

        // Try to find a matching glyph in ROM charset area 0x3C00..0x3FFF (256 bytes = 32 glyphs? actually 0x400 bytes = 512 glyphs? we search whole 0x3C00..0x3FFF by 8-byte steps)
        let found = null;
        for (let a = 0x3C00; a <= 0x3FFF; a += 8) {
          let ok = true;
          for (let j = 0; j < 8; j++) {
            const b = emu.readROM(a + j);
            if (b !== result.bitmapBytes[j]) { ok = false; break; }
          }
          if (ok) { found = a; break; }
        }
        if (found) {
          result.romMatchAddr = found;
          result.matchToRom = true;
        }
        return result;
      } catch (e) {
        return { error: String(e) };
      }
    },

    // Test helper: Compare the rendered canvas pixels for a character column against expected bitmap bytes
    compareColumnPixels: (col, topRow) => {
      try {
        const snap = window.__ZX_DEBUG__.snapshotGlyph(col, topRow);
        if (!snap || snap.error) return { error: 'snapshot_failed', snap };

        const canvas = document.getElementById('screen');
        if (!canvas) return { error: 'no_canvas' };
        const ctx = canvas.getContext('2d');
        if (!ctx) return { error: 'no_ctx' };

        // Compute canvas coordinates
        const xStart = 16 * 2 + col * 8; // left border (16 bytes -> 32 pixels) + col*8 pixels
        const yStart = 24 + topRow; // top border 24 pixels

        // Recreate palette used by renderer
        const baseColours = [
          [0, 0, 0],
          [0, 0, 192],
          [192, 0, 0],
          [192, 0, 192],
          [0, 192, 0],
          [0, 192, 192],
          [192, 192, 0],
          [192, 192, 192],
        ];
        const brightColours = [
          [0, 0, 0],
          [0, 0, 255],
          [255, 0, 0],
          [255, 0, 255],
          [0, 255, 0],
          [0, 255, 255],
          [255, 255, 0],
          [255, 255, 255],
        ];

        // Determine ink/paper and brightness/flash
        let ink = snap.attrByte & 0x07;
        let paper = (snap.attrByte >> 3) & 0x07;
        const bright = (snap.attrByte & 0x40) ? true : false;
        const flash = (snap.attrByte & 0x80) ? true : false;

        // If flash is set, consult frameBuffer flashPhase
        try {
          const fb = (window.emulator && window.emulator.ula && window.emulator.ula.frameBuffer) ? window.emulator.ula.frameBuffer : null;
          if (flash && fb && typeof fb.getFlashPhase === 'function') {
            const phase = fb.getFlashPhase();
            if (phase & 0x10) {
              const tmp = ink; ink = paper; paper = tmp;
            }
          }
        } catch (e) { /* ignore */ }

        const palette = (bright ? brightColours : baseColours);

        const mismatches = [];

        // For each of 8 rows
        for (let row = 0; row < 8; row++) {
          const bitmap = snap.bitmapBytes[row];
          for (let bit = 0; bit < 8; bit++) {
            const mask = 0x80 >> bit;
            const pixelSet = (bitmap & mask) !== 0;
            const expected = pixelSet ? palette[ink] : palette[paper];

            const img = ctx.getImageData(xStart + bit, yStart + row, 1, 1).data;
            const actual = [img[0], img[1], img[2]];

            if (actual[0] !== expected[0] || actual[1] !== expected[1] || actual[2] !== expected[2]) {
              mismatches.push({ row, bit, expected, actual });
            }
          }
        }

        return { col, topRow, mismatches, snap };
      } catch (e) {
        return { error: String(e) };
      }
    },

    // Test helper: return bottom two lines (190..191) bitmap bytes for cols 0..31
    peekBottomLines: () => {
      try {
        const out = [];
        if (!emu || typeof emu.readRAM !== 'function') return null;
        for (let r = 190; r <= 191; r++) {
          const row = [];
          for (let c = 0; c < 32; c++) {
            const rel = ((r & 0xC0) << 5) + ((r & 0x07) << 8) + ((r & 0x38) << 2) + c;
            row.push(emu.readRAM(rel));
          }
          out.push(row);
        }
        return out;
      } catch (e) { return null; }
    },

    // Timeline of key events for debugging glyph rendering
    getTimeline: () => {
      try {
        const timeline = [];
        
        // CHARS changes
        if (window.__TEST__ && window.__TEST__.charsHistory) {
          window.__TEST__.charsHistory.forEach(entry => {
            timeline.push({
              type: 'chars_change',
              timestamp: entry.t,
              pc: entry.pc,
              tstates: entry.tstates,
              chars: entry.chars,
              description: `CHARS set to 0x${entry.chars.toString(16)}`
            });
          });
        }
        
        // CHARS writes
        if (window.__TEST__ && window.__TEST__.charsWrites) {
          window.__TEST__.charsWrites.forEach(entry => {
            timeline.push({
              type: 'chars_write',
              timestamp: entry.timestamp,
              pc: entry.pc,
              tstates: entry.t,
              addr: entry.addr,
              value: entry.value,
              description: `Write to CHARS 0x${entry.addr.toString(16)} = 0x${entry.value.toString(16)}`
            });
          });
        }
        
        // Character bitmap writes
        if (window.__TEST__ && window.__TEST__.charBitmapWrites) {
          window.__TEST__.charBitmapWrites.forEach(entry => {
            timeline.push({
              type: 'char_bitmap_write',
              timestamp: entry.timestamp,
              pc: entry.pc,
              tstates: entry.t,
              addr: entry.addr,
              value: entry.value,
              description: `Write to char bitmap 0x${entry.addr.toString(16)} = 0x${entry.value.toString(16)}`
            });
          });
        }
        
        // Screen bitmap writes (sampled)
        if (window.__TEST__ && window.__TEST__.screenBitmapWrites) {
          window.__TEST__.screenBitmapWrites.forEach(entry => {
            timeline.push({
              type: 'screen_bitmap_write',
              timestamp: entry.timestamp,
              pc: entry.pc,
              tstates: entry.t,
              addr: entry.addr,
              value: entry.value,
              description: `Write to screen bitmap 0x${entry.addr.toString(16)} = 0x${entry.value.toString(16)}`
            });
          });
        }
        
        // Sort by timestamp
        timeline.sort((a, b) => a.timestamp - b.timestamp);
        
        return timeline;
      } catch (e) {
        return { error: String(e) };
      }
    }
  };

  // Expose legacy global for compatibility
  window.__LAST_PC__ = 0;
  
  // Initialize PC watcher for reliable debug tracking
  window.__PC_WATCHER__ = { history: [] };
  
  window.__ZX_STATE__ = {
    booted: () => emu._bootComplete,
    registers: () => emu.getRegisters()
  };
  
  // Enhanced debug API with boot completion detection
  window.__ZX_DEBUG__.bootComplete = () => {
    return emu._bootComplete;
  };
  
  // Add boot sequence monitoring to debug API
  window.__ZX_DEBUG__.getBootProgress = () => {
    if (!emu.cpu) return { visited: [], complete: false };
    const visited = Array.from(emu.cpu._visitedBootAddresses || []);
    return {
      visited,
      complete: emu._bootComplete,
      totalAddresses: emu.cpu._bootAddresses?.length || 5
    };
  };
  console.log('[Emulator] initialized and attached to window.emu and window.__ZX_DEBUG__');
});

export default Emulator;

