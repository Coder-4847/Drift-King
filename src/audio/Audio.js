// All sound is synthesised with the Web Audio API (no files). The context is created on the
// first user input (browser autoplay rules). Everything is safe to call before that: the
// calls just do nothing until audio is unlocked.

import { settings } from '../settings.js';
import { Music } from './Music.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.music = new Music(this);
    this.musicMuted = false;
    this.engineOn = false;
    this.lastSkid = 0;
  }

  // ---------------------------------------------------------------- setup
  /** Call from any user gesture (pointer / key / gamepad button). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    this.build();
    this.applySettings();
    if (this.music.wanted !== null) this.music.play(this.music.wanted);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor(); // keeps loud overlaps from clipping
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicGain = c.createGain(); this.musicFilter = c.createBiquadFilter();
    this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.musicGain.connect(this.musicFilter); this.musicFilter.connect(this.master);

    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned oscillators through a low-pass filter
    this.engA = c.createOscillator(); this.engA.type = 'sawtooth';
    this.engB = c.createOscillator(); this.engB.type = 'square';
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500; this.engFilter.Q.value = 2;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    const mix = c.createGain(); mix.gain.value = 0.5;
    this.engA.connect(mix); this.engB.connect(mix); mix.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.sfx);
    this.engA.start(); this.engB.start();

    // tyre squeal: band-passed noise + a thin whine
    this.skidSrc = c.createBufferSource(); this.skidSrc.buffer = this.noiseBuf; this.skidSrc.loop = true;
    this.skidFilter = c.createBiquadFilter(); this.skidFilter.type = 'bandpass'; this.skidFilter.frequency.value = 1500; this.skidFilter.Q.value = 6;
    this.skidGain = c.createGain(); this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidFilter); this.skidFilter.connect(this.skidGain); this.skidGain.connect(this.sfx);
    this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 1100;
    this.whineGain = c.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain); this.whineGain.connect(this.sfx);
    this.skidSrc.start(); this.whine.start();
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(settings.sfxVolume, t, 0.03);
    this.musicGain.gain.setTargetAtTime(settings.musicVolume * 0.9, t, 0.05);
    this.musicMuted = settings.musicVolume <= 0.001;
  }

  // ---------------------------------------------------------------- building blocks
  /** One synth note. opts: attack, release, lp (low-pass Hz), dest. */
  voice(freq, t, dur, wave, gain, { attack = 0.01, release = 0.08, lp = 0, dest = null, slideTo = 0 } = {}) {
    const c = this.ctx;
    if (!c || gain <= 0) return;
    const o = c.createOscillator(); o.type = wave || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + release);
    let node = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
    node.connect(g);
    g.connect(dest || this.musicGain);
    o.start(t); o.stop(t + dur + release + 0.05);
  }

  noise(t, dur, { type = 'bandpass', freq = 2000, q = 1, gain = 0.2, dest = null, sweepTo = 0, attack = 0.002 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.musicGain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  kick(t, gain = 0.5) { this.voice(150, t, 0.16, 'sine', gain, { attack: 0.002, release: 0.04, slideTo: 42 }); }
  snare(t, gain = 0.25) { this.noise(t, 0.14, { freq: 1900, q: 0.8, gain }); this.voice(190, t, 0.08, 'triangle', gain * 0.6, { attack: 0.002, release: 0.03 }); }
  hat(t, gain = 0.1) { this.noise(t, 0.04, { type: 'highpass', freq: 7500, gain }); }
  tom(t, gain = 0.4, high = false) { this.voice(high ? 230 : 150, t, 0.22, 'sine', gain, { attack: 0.002, release: 0.05, slideTo: high ? 120 : 62 }); }
  clank(t, gain = 0.15) { this.noise(t, 0.2, { freq: 3400, q: 14, gain }); this.voice(1240, t, 0.1, 'square', gain * 0.12, { attack: 0.001, release: 0.08, lp: 3000 }); }

  // ---------------------------------------------------------------- one-shot effects (sfx bus)
  tone(freq, dur, { type = 'square', gain = 0.12, delay = 0, slideTo = 0, lp = 0 } = {}) {
    if (!this.ctx) return;
    this.voice(freq, this.ctx.currentTime + delay, dur, type, gain, { attack: 0.004, release: 0.05, dest: this.sfx, slideTo, lp });
  }
  bell(freq, delay = 0, gain = 0.16) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    this.voice(freq, t, 0.5, 'sine', gain, { attack: 0.003, release: 0.5, dest: this.sfx });
    this.voice(freq * 2.76, t, 0.3, 'sine', gain * 0.35, { attack: 0.003, release: 0.3, dest: this.sfx });
  }

  click() { this.tone(1250, 0.03, { type: 'triangle', gain: 0.13 }); }
  focus() { this.tone(720, 0.02, { type: 'sine', gain: 0.06 }); }
  back() { this.tone(520, 0.05, { type: 'triangle', gain: 0.1 }); }
  deny() { this.tone(180, 0.1, { type: 'sawtooth', gain: 0.07, lp: 600 }); }

  countdown(step) { // 3, 2, 1
    this.tone(520, 0.14, { type: 'square', gain: 0.1, lp: 2500 });
    void step;
  }
  go() {
    this.tone(1040, 0.4, { type: 'square', gain: 0.1, lp: 3000 });
    this.tone(1560, 0.4, { type: 'square', gain: 0.06, lp: 3000 });
  }
  boost() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.6, { type: 'highpass', freq: 600, sweepTo: 4500, gain: 0.16, dest: this.sfx, attack: 0.05 });
    this.tone(300, 0.4, { type: 'sawtooth', gain: 0.05, slideTo: 900, lp: 2000 });
  }
  thud(strength = 0.5) {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.18, { type: 'lowpass', freq: 500, gain: 0.25 * clamp(strength * 2, 0.3, 1), dest: this.sfx });
    this.tone(90, 0.14, { type: 'sine', gain: 0.3 * clamp(strength * 2, 0.3, 1), slideTo: 45 });
  }
  /** Leaving the road: a heavy hit, a metallic scrape and a falling groan. Music muffles. */
  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.7, { type: 'lowpass', freq: 1100, sweepTo: 110, gain: 0.5, dest: this.sfx });
    this.tone(110, 0.6, { type: 'sine', gain: 0.4, slideTo: 36 });
    this.noise(t + 0.03, 0.18, { type: 'highpass', freq: 2800, gain: 0.18, dest: this.sfx });
    this.tone(260, 0.9, { type: 'sawtooth', gain: 0.05, slideTo: 55, lp: 500, delay: 0.05 });
    this.noise(t + 0.35, 0.3, { type: 'bandpass', freq: 600, q: 2, gain: 0.12, dest: this.sfx });
    this.duck(true);
  }
  /** Soft falling sting when the loss screen opens. */
  lossSting() { [392, 311, 233].forEach((f, i) => this.bell(f, i * 0.16, 0.1)); }

  bump() { this.noise(this.ctx ? this.ctx.currentTime : 0, 0.08, { type: 'lowpass', freq: 800, gain: 0.1, dest: this.sfx }); }
  lap() { this.bell(988, 0, 0.12); this.bell(1319, 0.1, 0.12); }
  star(i) { this.bell([1047, 1319, 1568][i] || 1568, 0, 0.18); this.tone([523, 659, 784][i] || 784, 0.25, { type: 'triangle', gain: 0.06 }); }
  fail() { this.tone(330, 0.25, { type: 'triangle', gain: 0.1, slideTo: 200 }); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.bell(f, i * 0.09, 0.14)); }

  // ---------------------------------------------------------------- continuous (engine + tyres)
  /**
   * Call every frame. s: { active, speed, maxSpeed, braking, slide (0..1), boosting }.
   * The engine "shifts" through 5 gears so the pitch rises and falls like a real car.
   */
  engineUpdate(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!s.active) {
      this.engGain.gain.setTargetAtTime(0, t, 0.05);
      this.skidGain.gain.setTargetAtTime(0, t, 0.05);
      this.whineGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const f = clamp(s.speed / s.maxSpeed, 0, 1.2);
    const edges = [0, 0.2, 0.4, 0.6, 0.8, 1.2];
    let g = 0;
    while (g < 4 && f > edges[g + 1]) g++;
    const x = clamp((f - edges[g]) / (edges[g + 1] - edges[g]), 0, 1);
    const rpm = 0.3 + 0.7 * x;
    const hz = 48 + rpm * 85 + g * 6;
    this.engA.frequency.setTargetAtTime(hz, t, 0.04);
    this.engB.frequency.setTargetAtTime(hz * 0.5 + (s.slide > 0.2 ? 3 : 0), t, 0.04);
    this.engFilter.frequency.setTargetAtTime(380 + rpm * 1500 + (s.boosting ? 1200 : 0), t, 0.05);
    this.engGain.gain.setTargetAtTime((0.05 + 0.05 * rpm) * (s.braking ? 0.7 : 1) * (s.boosting ? 1.3 : 1), t, 0.05);

    const sq = s.slide > 0.12 && s.speed > 6 ? clamp(s.slide, 0, 1) : 0;
    this.skidGain.gain.setTargetAtTime(sq * 0.22, t, 0.04);
    this.skidFilter.frequency.setTargetAtTime(1300 + sq * 900, t, 0.06);
    this.whineGain.gain.setTargetAtTime(sq * 0.018, t, 0.06);
    this.whine.frequency.setTargetAtTime(950 + sq * 500 + s.speed * 6, t, 0.08);
  }

  // ---------------------------------------------------------------- music
  playMusic(chapter) { this.music.play(chapter); }
  stopMusic() { this.music.stop(); }
  /** Muffle + quiet the music (pause menu / results). */
  duck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(on ? 900 : 18000, t, 0.1);
  }
}

export const audio = new AudioEngine();
