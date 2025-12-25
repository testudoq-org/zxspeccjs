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

    // Debug API state
    this._debugEnabled = true;
    this._bootAddresses = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
    this._portWrites = [];
    this._executedOpcodes = [];
    this._lastPC = 0;
    this._bootComplete = false;

    this._bindUI();
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
      this._portWrites.push({ port, value, tstates: this.cpu ? this.cpu.tstates : 0 });
    }
  }

  _trackOpcodeExecution(opcode, pc) {
    if (this._debugEnabled) {
      this._executedOpcodes.push(`0x${opcode.toString(16).padStart(2, '0')} at 0x${pc.toString(16).padStart(4, '0')}`);
      this._lastPC = pc;
      
      // Track boot progression
      if (this._bootAddresses.includes(pc)) {
        // console.log(`[DEBUG] Boot address 0x${pc.toString(16).padStart(4, '0')} reached`);
      }
      
      // Check for boot completion (at final boot address)
      if (pc === 0x11CB) {
        this._bootComplete = true;
        // console.log('[DEBUG] Boot sequence complete');
      }
    }
  }

  _bindUI() {
    const loadBtn = document.getElementById('loadBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');

    if (loadBtn) loadBtn.addEventListener('click', () => this.handleLoad());
    if (startBtn) startBtn.addEventListener('click', () => this.start());
    if (stopBtn) stopBtn.addEventListener('click', () => this.pause());
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());

    // Allow file input drag/drop helpers
    if (this.romInput) Loader.attachInput(this.romInput, (result, file) => this._onFileLoaded(result, file));

    // ROM selector UI
    try {
      const sel = document.getElementById('rom-select');
      if (sel) {
        romManager.initRomSelector(sel, async (id) => {
          try {
            this.status(`loading ROM: ${id}...`);
            const data = await romManager.loadRom(id);
            // initialize core with ROM bytes and apply memory configuration
            await this.loadROM(data.rom);
            try { romManager.applyMemoryConfig(this.memory, data.metadata, data.rom); } catch (e) {}
            this.status(`selected ROM: ${id}`);
            this._selectedRom = id;
          } catch (e) {
            console.error('ROM load failed', e);
            this.status('ROM load failed');
          }
        });
      }
    } catch (e) {}

    // If a preloaded ROM is bundled, update UI to reflect default
    try {
      if (typeof spec48 !== 'undefined' && spec48) {
        // indicate default ROM available; keep manual load as an override option
        if (this.statusEl) this.statusEl.textContent = 'Status: default ROM (spec48) available';
        if (loadBtn) loadBtn.textContent = 'Load (override default)';
      }
    } catch (e) {}

    // Virtual keyboard toggle (optional)
    try { this.input.createVirtualKeyboard('body'); } catch (e) {}
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
    
    // Set debug callback for instruction tracking
    if (this._debugEnabled) {
      this.cpu.debugCallback = (opcode, pc) => {
        // CRITICAL: Use the PC value passed to callback (current instruction address)
        // NOT this.cpu.PC which would be the NEXT instruction address
        this._trackOpcodeExecution(opcode, pc);
        if (typeof window !== 'undefined') {
          window.__LAST_PC__ = pc; // Use the actual instruction PC, not the next one
        }
      };
      // Enable verbose debugging for tests
      this.cpu._debugVerbose = true;
    }
    
    this.memory.attachCPU(this.cpu);
    this.ula = new ULA(this.memory, this.canvas);
    this.ula.attachCPU(this.cpu); // CRITICAL: Connect ULA to CPU for interrupt generation
    this.sound = new Sound();
    
    // CRITICAL: Initialize I/O channel system for boot sequence
    this._initializeIOSystem();

    // Create IO adapter to connect CPU port I/O to ULA and Sound modules
    const ioAdapter = {
      write: (port, value, tstates) => {
        // Track port write for debug API
        this._trackPortWrite(port, value);
        
        // Route port 0xFE to ULA for border control
        if ((port & 0xFF) === 0xFE) {
          this.ula.writePort(port, value);
        }
        // Route other ports to sound if needed
        if (this.sound && typeof this.sound.writePort === 'function') {
          this.sound.writePort(port, value, tstates);
        }
      },
      read: (port) => {
        // Route port 0xFE to ULA for keyboard reading
        if ((port & 0xFF) === 0xFE) {
          return this.ula.readPort(port);
        }
        return 0xFF; // Default for unhandled ports
      }
    };
  
    // Add ROM visibility verification to debug API
    window.__ZX_DEBUG__.isROMVisible = (address = 0) => {
      // Checks if the byte at address matches the ROM byte
      if (!emu.memory || !window.spec48 || !window.spec48.bytes) return false;
      if (address < 0 || address >= window.spec48.bytes.length) return false;
      return emu.memory.read(address) === window.spec48.bytes[address];
    };
    
    this.cpu.io = ioAdapter;
    console.log('[Emulator] _createCore: connected CPU io adapter for port 0xFE border control');

    console.log('[Emulator] _createCore: memory', this.memory, 'cpu', this.cpu, 'ula', this.ula);

    // Input wiring
    this.input.start();

    // If ROM buffer provided, keep a copy for resets
    if (romBuffer) this.romBuffer = romBuffer.slice ? romBuffer.slice(0) : romBuffer;

    // initial render
    this.ula.render();
    console.log('[Emulator] _createCore: initial render called');
  }

  async loadROM(arrayBuffer) {
    // initialize core with given ROM
    await this._createCore(arrayBuffer);
    // Boot PC typically 0x0000 (ROM entry)
    this.cpu.reset();
    // attach ULA keyboard matrix snapshot
    this._applyInputToULA();
  }

  _applyInputToULA() {
    // ULA expects 8 bytes, active-low; Input.matrix uses 5-bit rows (1=up). Merge into 8-bit rows.
    for (let r = 0; r < 8; r++) {
      const rowVal = (this.input.matrix && this.input.matrix[r] != null) ? this.input.matrix[r] & 0x1f : 0x1f;
      // place into low 5 bits; set upper bits to 1
      const full = (rowVal & 0x1f) | 0b11100000;
      if (this.ula && this.ula.keyMatrix) this.ula.keyMatrix[r] = full;
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
      // Enable verbose debugging for tests
      this.cpu._debugVerbose = true;
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

  // CRITICAL: Initialize I/O channel system for boot sequence
  _initializeIOSystem() {
    if (!this.memory) return;
    
    // Initialize system variables for I/O channel system
    // CHANS (0x5C36) - Channel information table address
    // CURCHL (0x5C37) - Current channel address
    
    // Create basic channel table in RAM
    // Channel table format: [stream_type, stream_params...]
    // K = keyboard channel, S = screen channel, P = printer channel
    
    const channelTable = [
      0x4B, 0x00, 0x00, // 'K' (keyboard) - 3 bytes
      0x53, 0x00, 0x00, // 'S' (screen) - 3 bytes  
      0x50, 0x00, 0x00, // 'P' (printer) - 3 bytes
      0x80              // End marker
    ];
    
    // Store channel table in RAM starting at 0x5C36
    for (let i = 0; i < channelTable.length && (0x5C36 + i) < 0x5C40; i++) {
      this.memory.write(0x5C36 + i, channelTable[i]);
    }
    
    // Set CURCHL to point to screen channel (0x5C39)
    this.memory.write(0x5C37, 0x39); // Low byte of screen channel address
    this.memory.write(0x5C38, 0x5C); // High byte of screen channel address
    
    // Initialize other system variables
    // DF_SZ (0x5C6B) - Display file size (24 lines)
    this.memory.write(0x5C6B, 24);
    
    // DF_CC (0x5C6C) - Display file cursor column
    this.memory.write(0x5C6C, 0);
    
    // DF_CC (0x5C6D) - Display file cursor row  
    this.memory.write(0x5C6D, 0);
    
    // S_POSN (0x5C7A) - Stream position
    this.memory.write(0x5C7A, 0); // Column
    this.memory.write(0x5C7B, 0); // Row
    
    if (typeof console !== 'undefined' && console.log) {
      console.log('[Emulator] I/O channel system initialized');
      console.log(`[Emulator] CHANS table at 0x5C36: ${channelTable.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}`);
    }
  }

  _loop(now) {
    if (!this._running) return;
    // DEBUG: log loop entry
    // console.log('[Emulator] _loop: running');
    const dt = now - this._lastTime;
    this._lastTime = now;
    this._acc += dt;

    // Run one or more 50Hz frames if enough time elapsed
    while (this._acc >= FRAME_MS) {
      // sync input matrix to ULA
      this._applyInputToULA();

      // Run CPU for a full frame worth of t-states with interrupt generation
      if (this.cpu && typeof this.cpu.runFor === 'function') {
        const tstatesBefore = this.cpu.tstates;
        this.cpu.runFor(TSTATES_PER_FRAME);
        const tstatesExecuted = this.cpu.tstates - tstatesBefore;
        
        // CRITICAL: Generate 50Hz interrupts based on actual t-states executed
        if (this.ula && typeof this.ula.generateInterrupt === 'function') {
          this.ula.generateInterrupt(tstatesExecuted);
          this.ula.updateInterruptState(); // Update interrupt enable state
        }
      }

      // ULA render
      if (this.ula) {
        // DEBUG: log ULA render
        // console.log('[Emulator] _loop: ula.render');
        this.ula.render();
      }

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
        try { romManager.applyMemoryConfig(emu.memory, data.metadata, data.rom); } catch (e) {}
        emu.status(`selected ROM: ${id}`);
      } catch (e) {
        console.error('ROM selection failed', e);
        emu.status('ROM selection failed');
      }
    });
    const sel = document.getElementById('rom-select');
    if (sel) sel.value = 'spec48';
  } catch (e) {}

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
    } else {
      console.log('[Emulator] spec48 not available for auto-loading');
    }
  } catch (e) {
    console.error('Failed to auto-load default ROM', e);
    emu.status('default ROM load failed');
  }

  // Expose for console debugging
  window.emu = emu;
  
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

