export class Sound {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.osc = null;
    this.oscRunning = false;
    this.lastSpeakerBit = 0;
    this.lastTstates = null; // last tstate when speaker bit changed
    this._tstatesPerSecond = 3500000; // ZX Spectrum ~3.5 MHz
    this._minFreq = 40;
    this._maxFreq = 8000;

    // Lazy init audio context (many browsers require user gesture to resume)
    this._initContext();
  }

  _initContext() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) {
        console.warn('WebAudio not available');
        return;
      }
      this.ctx = new C();

      // master gain
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.0; // start muted
      this.gain.connect(this.ctx.destination);

      // create oscillator but don't drive it until we have frequency
      this.osc = this.ctx.createOscillator();
      // use square wave to approximate Spectrum beeper
      try {
        this.osc.type = 'square';
      } catch (e) {
        // older implementations may not allow setting type before start
      }
      this.osc.connect(this.gain);
      // start oscillator; keep it silent until needed
      try {
        this.osc.start();
        this.oscRunning = true;
      } catch (e) {
        // if already started or not allowed yet, ignore
        this.oscRunning = true;
      }
    } catch (e) {
      console.warn('Failed to initialize audio context', e);
      this.ctx = null;
    }
  }

  // External callers (e.g., ULA or main) should call this when writing to port 0xFE
  // port: full 16-bit port address, value: 8-bit value written, tstates: optional CPU tstate counter
  writePort(port, value, tstates = null) {
    if ((port & 0xff) !== 0xfe) return;
    const bit = (value & 0x10) ? 1 : 0; // bit 4 = speaker

    // Lazy resume context on first interaction
    if (this.ctx && this.ctx.state === 'suspended') {
      // try to resume; best-effort
      this.ctx.resume().catch(() => {});
    }

    // If bit didn't change, nothing to update
    if (bit === this.lastSpeakerBit) return;

    // Compute frequency if we have tstates timing info
    if (tstates != null && this.lastTstates != null && tstates !== this.lastTstates) {
      const delta = Math.abs(tstates - this.lastTstates);
      const seconds = delta / this._tstatesPerSecond;
      // If software toggles speaker repeatedly, each toggle represents half period.
      // The resulting square wave frequency is 1 / (2 * seconds)
      if (seconds > 0) {
        let freq = 1 / (2 * seconds);
        // clamp frequency
        freq = Math.max(this._minFreq, Math.min(this._maxFreq, freq));
        this._setFrequency(freq);
      }
    }

    // Update amplitude to reflect speaker level (simple model)
    if (this.gain) {
      // when bit=1 we set audible level, bit=0 mute; use a short ramp for smoothing
      const now = this.ctx ? this.ctx.currentTime : 0;
      const target = bit ? 0.2 : 0.0; // modest volume
      if (this.gain.gain.cancelScheduledValues) this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(target, now, 0.01);
    }

    this.lastSpeakerBit = bit;
    if (tstates != null) this.lastTstates = tstates;
  }

  _setFrequency(freq) {
    if (!this.osc) return;
    try {
      this.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    } catch (e) {
      try {
        this.osc.frequency.value = freq;
      } catch (ee) {}
    }
  }

  // Optional: allow external ticking with tstates to estimate frequency when caller only signals toggle
  notifyToggleAt(tstates) {
    // record toggle time; if we have previous, compute frequency
    if (this.lastTstates != null) {
      const delta = Math.abs(tstates - this.lastTstates);
      const seconds = delta / this._tstatesPerSecond;
      if (seconds > 0) {
        let freq = 1 / (2 * seconds);
        freq = Math.max(this._minFreq, Math.min(this._maxFreq, freq));
        this._setFrequency(freq);
      }
    }
    this.lastTstates = tstates;
  }

  // Clean up audio resources
  close() {
    try {
      if (this.osc && this.osc.stop) this.osc.stop();
    } catch (e) {}
    try {
      if (this.gain) this.gain.disconnect();
    } catch (e) {}
    try {
      if (this.ctx && this.ctx.close) this.ctx.close();
    } catch (e) {}
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.oscRunning = false;
  }
}
