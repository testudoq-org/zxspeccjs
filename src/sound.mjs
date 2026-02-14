/* eslint-env browser */
/* global window */

/**
 * ZX Spectrum beeper sound — sample-buffer approach.
 *
 * The Spectrum beeper is a 1-bit DAC driven by bit 4 of port 0xFE.
 * Each frame (69888 T-states @ 3.5 MHz ≈ 20 ms) we record every speaker-bit
 * toggle with its T-state timestamp. At end-of-frame we convert those
 * timestamps into a PCM waveform and queue it via Web Audio.
 */
const TSTATES_PER_FRAME = 69888;
const TSTATES_PER_SECOND = 3500000;
const SAMPLE_RATE = 44100;
const SAMPLES_PER_FRAME = Math.ceil(SAMPLE_RATE * TSTATES_PER_FRAME / TSTATES_PER_SECOND); // ~882

export class Sound {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this._muted = false;
    this._volume = 0.2;

    // Current speaker level (+volume or -volume), toggled by bit 4
    this._speakerBit = 0;
    // Ring of {tstate, level} events within the current frame
    this._toggles = [];
    // T-state of the frame start (reset each endFrame)
    this._frameStartTstates = 0;
    // Next audio buffer scheduling time (seconds in AudioContext timeline)
    this._nextPlayTime = 0;

    this._initContext();
  }

  // --- Public API (unchanged signatures) ---

  setMuted(muted) {
    this._muted = !!muted;
    if (this._muted && this.gain) {
      this.gain.gain.setValueAtTime(0, this.ctx ? this.ctx.currentTime : 0);
    }
  }

  isMuted() { return this._muted; }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this.gain && !this._muted) {
      this.gain.gain.setValueAtTime(this._volume, this.ctx ? this.ctx.currentTime : 0);
    }
  }

  /**
   * Called on every OUT to port 0xFE. Records speaker-bit toggles with
   * their T-state timestamp so we can build a PCM buffer at end-of-frame.
   */
  writePort(port, value, tstates = null) {
    if ((port & 0xff) !== 0xfe) return;
    const bit = (value & 0x10) ? 1 : 0;

    // Lazy-resume audio context (browsers require user gesture)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* expected until user gesture */ });
    }

    if (bit === this._speakerBit) return; // no change
    this._speakerBit = bit;

    // Record the toggle timestamp relative to frame start
    const t = tstates != null ? tstates : 0;
    this._toggles.push({ t, level: bit });
  }

  /**
   * Kept for API compatibility — used by main loop's per-frame notify.
   * We now use it as the end-of-frame trigger to flush the sample buffer.
   */
  notifyToggleAt(/* tstates */) {
    // no-op: endFrame is called explicitly
  }

  /**
   * Call once per emulated frame (after CPU has executed 69888 T-states).
   * Converts the recorded speaker toggles into a PCM AudioBuffer and queues it.
   */
  endFrame(frameStartTstates) {
    if (!this.ctx || this._muted) {
      this._toggles.length = 0;
      this._frameStartTstates = frameStartTstates || 0;
      return;
    }

    const buf = this.ctx.createBuffer(1, SAMPLES_PER_FRAME, SAMPLE_RATE);
    const data = buf.getChannelData(0);

    this._fillSampleBuffer(data);
    this._queueBuffer(buf);

    // Reset for next frame
    this._toggles.length = 0;
    this._frameStartTstates = (frameStartTstates || 0) + TSTATES_PER_FRAME;
  }

  /** Fill PCM data array from recorded speaker toggles. */
  _fillSampleBuffer(data) {
    const vol = this._volume;
    const toggles = this._toggles;
    let toggleIdx = 0;

    // Level before the first toggle this frame
    let level = toggles.length > 0 ? (toggles[0].level ? 0 : 1) : this._speakerBit;
    const origin = this._frameStartTstates || 0;

    for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
      const sampleTstate = origin + Math.round(i * TSTATES_PER_FRAME / SAMPLES_PER_FRAME);

      while (toggleIdx < toggles.length && toggles[toggleIdx].t <= sampleTstate) {
        level = toggles[toggleIdx].level;
        toggleIdx++;
      }

      data[i] = level ? vol : -vol;
    }
  }

  /** Queue a filled AudioBuffer for playback. */
  _queueBuffer(buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);

    const now = this.ctx.currentTime;
    if (this._nextPlayTime < now) this._nextPlayTime = now;
    src.start(this._nextPlayTime);
    this._nextPlayTime += buf.duration;
  }

  close() {
    try { if (this.gain) this.gain.disconnect(); } catch { /* ignore */ }
    try { if (this.ctx && this.ctx.close) this.ctx.close(); } catch { /* ignore */ }
    this.ctx = null;
    this.gain = null;
  }

  // --- Private ---

  _initContext() {
    try {
      if (typeof window === 'undefined') return;
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();

      this.gain = this.ctx.createGain();
      this.gain.gain.value = this._volume;
      this.gain.connect(this.ctx.destination);
    } catch (_e) {
      this.ctx = null;
    }
  }
}
