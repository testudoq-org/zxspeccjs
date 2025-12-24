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

    this._bindUI();
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
    this.memory = new Memory(romBuffer);
    this.cpu = new Z80(this.memory);
    this.memory.attachCPU(this.cpu);
    this.ula = new ULA(this.memory, this.canvas);
    this.sound = new Sound();

    // Input wiring
    this.input.start();

    // If ROM buffer provided, keep a copy for resets
    if (romBuffer) this.romBuffer = romBuffer.slice ? romBuffer.slice(0) : romBuffer;

    // initial render
    this.ula.render();
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
    if (!this.cpu || !this.memory) return;
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._acc = 0;
    this.status('running');
    this._loop = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }

  pause() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this.status('paused');
  }

  reset() {
    if (!this.memory || !this.cpu) return;
    this.memory.reset();
    this.cpu.reset();
    if (this.romBuffer) this.memory.loadROM(this.romBuffer);
    // clear ULA flash/timers
    if (this.ula) {
      this.ula.flashState = false;
      this.ula._lastFlashToggle = performance.now();
      this.ula.render();
    }
    this.status('reset');
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

      // Run CPU for a full frame worth of t-states
      if (this.cpu && typeof this.cpu.runFor === 'function') {
        this.cpu.runFor(TSTATES_PER_FRAME);
      }

      // ULA render
      if (this.ula) this.ula.render();

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
window.addEventListener('DOMContentLoaded', () => {
  // Ensure required elements exist
  const canvas = document.getElementById('screen');
  if (!canvas) return;

  const emu = new Emulator({ canvas });

  // Expose for console debugging
  window.emu = emu;
});

export default Emulator;
