// Step sequencer for the generated music. Schedules notes a little ahead of time with the
// Web Audio clock (look-ahead scheduler), so timing stays tight even if the main thread hiccups.

import { mulberry32 } from '../rng.js';
import { MUSIC } from '../data/music.js';

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  constructor(engine) {
    this.eng = engine;
    this.style = null;
    this.timer = null;
    this.wanted = null;   // chapter index we should be playing (survives audio not being unlocked yet)
  }

  play(index) {
    this.wanted = index;
    const eng = this.eng;
    if (!eng.ctx) return; // will start after the first user input
    if (this.style === MUSIC[index] && this.timer) return;
    this.stop(true);
    const st = MUSIC[index];
    this.style = st;
    this.rnd = mulberry32(st.seed * 977);
    this.step = 0;
    this.nextTime = eng.ctx.currentTime + 0.12;
    this.melody = new Map();
    this.timer = setInterval(() => this.tick(), 50);
  }

  /** Schedule `seconds` of a style on the engine's context in one go (used by the offline audio test). */
  scheduleAll(index, seconds) {
    const st = MUSIC[index];
    this.style = st; this.rnd = mulberry32(st.seed * 977); this.melody = new Map();
    const stepDur = 60 / st.bpm / 4;
    for (let i = 0, t = 0; t < seconds; i++, t += stepDur) this.scheduleStep(i, t, stepDur);
    this.style = null;
  }

  stop(keepWanted = false) {
    if (!keepWanted) this.wanted = null;
    clearInterval(this.timer);
    this.timer = null;
    this.style = null;
  }

  tick() {
    const ctx = this.eng.ctx, st = this.style;
    if (!ctx || !st) return;
    if (this.eng.musicMuted) { this.nextTime = Math.max(this.nextTime, ctx.currentTime); return; }
    const stepDur = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  freq(degree, oct, st) {
    const n = st.scale.length;
    const idx = Math.floor(degree / n), within = ((degree % n) + n) % n;
    return midiToHz(st.root + st.scale[within] + 12 * (idx + oct));
  }

  scheduleStep(step, t, dur) {
    const st = this.style, eng = this.eng;
    const pos = step % 16, bar = Math.floor(step / 16);
    const chord = st.bars[bar % st.bars.length];
    const V = st.vol || 1;
    for (const L of st.layers) {
      const G = L.gain * V;
      const hit = L.pat ? L.pat[pos] === 'x' : false;
      switch (L.kind) {
        case 'pad':
          if (pos === 0) for (const d of [0, 2, 4]) eng.voice(this.freq(chord + d, L.oct, st), t, dur * 16, L.wave, G, { attack: dur * 5, lp: L.lp || 1800, release: dur * 3 });
          break;
        case 'bass':
          if (hit) eng.voice(this.freq(chord, L.oct, st), t, dur * L.len, L.wave, G, { attack: 0.01, lp: L.lp || 900, release: 0.06 });
          break;
        case 'arp':
          if (hit) {
            const k = this.arpIndex = ((this.arpIndex || 0) + 1);
            const shape = L.shape || [0, 1, 2];
            eng.voice(this.freq(chord + shape[k % shape.length] * 2, L.oct, st), t, dur * L.len, L.wave, G, { attack: 0.005, lp: L.lp || 3000, release: 0.08 });
          }
          break;
        case 'lead':
          if (hit) {
            // melodic walk, remembered per (bar, step) so the loop repeats
            const key = (bar % st.bars.length) * 16 + pos;
            if (!this.melody.has(key)) this.melody.set(key, [0, 1, 2, 3, 4, 2, 1][Math.floor(this.rnd() * 7)]);
            const f = this.freq(chord + this.melody.get(key), L.oct, st);
            eng.voice(f, t, dur * L.len, L.wave, G, { attack: 0.01, lp: L.lp || 3200, release: 0.1 });
            if (L.bell) eng.voice(f * 2.01, t, dur * L.len * 0.6, 'sine', G * 0.35, { attack: 0.005, release: 0.15 });
          }
          break;
        case 'bell':
          if (this.rnd() < L.prob * 0.25) eng.voice(this.freq(chord + Math.floor(this.rnd() * 5), L.oct, st), t, dur * 6, L.wave, G, { attack: 0.005, release: dur * 6 });
          break;
        case 'kick': if (hit) eng.kick(t, G); break;
        case 'snare': if (hit) eng.snare(t, G); break;
        case 'hat': if (hit) eng.hat(t, G); break;
        case 'tom': if (hit) eng.tom(t, G, L.high); break;
        case 'clank': if (hit) eng.clank(t, G); break;
        default: break;
      }
    }
  }
}
