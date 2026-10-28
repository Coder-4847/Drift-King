// Generated music: one style per chapter (index 0..9). Played by src/audio/Music.js with
// Web Audio synths - no audio files. Patterns are 16 steps per bar ('x' = hit, '.' = rest);
// `bars` are chord roots as scale-degree indices, one per bar, looped.
//
// vol: loudness trim so every chapter sits at a similar level (measured with the offline render test).
// layer kinds: bass, arp, lead (seeded melodic walk), pad (sustained chord), bell (sparse random notes),
//              kick, snare, hat, tom, clank (metal hit)

const PENT = [0, 2, 4, 7, 9], MINPENT = [0, 3, 5, 7, 10], MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11], PHRYG = [0, 1, 4, 5, 7, 8, 10];

export const MUSIC = [
  { name: 'Pine Valley', vol: 2.2, bpm: 92, root: 57, scale: PENT, bars: [0, 3, 4, 2], seed: 1, layers: [
    { kind: 'pad', wave: 'triangle', gain: 0.05, oct: 0 },
    { kind: 'arp', wave: 'triangle', gain: 0.11, pat: 'x.x.x.x.x.x.x.x.', oct: 1, len: 0.5, shape: [0, 1, 2, 1] },
    { kind: 'bass', wave: 'sine', gain: 0.16, pat: 'x.......x.......', oct: -1, len: 0.9 },
    { kind: 'lead', wave: 'sine', gain: 0.06, pat: '......x.....x...', oct: 2, len: 0.8 }] },

  { name: 'Frostbite Pass', vol: 1.5, bpm: 70, root: 62, scale: MINPENT, bars: [0, 2, 3, 1], seed: 2, layers: [
    { kind: 'pad', wave: 'sine', gain: 0.07, oct: 0 },
    { kind: 'bell', wave: 'sine', gain: 0.09, prob: 0.2, oct: 2 },
    { kind: 'bass', wave: 'sine', gain: 0.14, pat: 'x...............', oct: -1, len: 3 }] },

  { name: 'Neon Downtown', vol: 0.8, bpm: 108, root: 45, scale: MINOR, bars: [0, 5, 2, 6], seed: 3, layers: [
    { kind: 'bass', wave: 'sawtooth', gain: 0.1, pat: 'x.xxx.xxx.xxx.xx', oct: -1, len: 0.5, lp: 600 },
    { kind: 'arp', wave: 'square', gain: 0.045, pat: 'xxxxxxxxxxxxxxxx', oct: 1, len: 0.45, shape: [0, 1, 2, 1, 2, 1, 0, 1], lp: 2200 },
    { kind: 'pad', wave: 'sawtooth', gain: 0.03, oct: 0, lp: 900 },
    { kind: 'kick', pat: 'x...x...x...x...', gain: 0.5 }, { kind: 'snare', pat: '....x.......x...', gain: 0.25 }, { kind: 'hat', pat: '..x...x...x...x.', gain: 0.12 }] },

  { name: 'Dune Run', vol: 0.85, bpm: 100, root: 52, scale: PHRYG, bars: [0, 0, 3, 4], seed: 4, layers: [
    { kind: 'bass', wave: 'sine', gain: 0.16, pat: 'x.....x.x.......', oct: -1, len: 0.8 },
    { kind: 'lead', wave: 'triangle', gain: 0.12, pat: 'x..x..x.x..x..x.', oct: 1, len: 0.35 },
    { kind: 'pad', wave: 'triangle', gain: 0.035, oct: 0 },
    { kind: 'tom', pat: 'x.....x...x.....', gain: 0.4 }, { kind: 'tom', pat: '..x...x.x...x.x.', gain: 0.2, high: true }] },

  { name: 'Harbor Rush', vol: 0.7, bpm: 118, root: 40, scale: MINPENT, bars: [0, 0, 3, 2], seed: 5, layers: [
    { kind: 'bass', wave: 'square', gain: 0.085, pat: 'x.x.xx.xx.x.xx.x', oct: 0, len: 0.5, lp: 500 },
    { kind: 'kick', pat: 'x...x...x...x...', gain: 0.55 }, { kind: 'hat', pat: '..x...x...x...x.', gain: 0.13 },
    { kind: 'clank', pat: 'x...x..x....x...', gain: 0.18 },
    { kind: 'arp', wave: 'triangle', gain: 0.06, pat: '..x...x...x...x.', oct: 1, len: 0.3, shape: [0, 2, 1] }] },

  { name: 'Autumn Ridge', vol: 1.7, bpm: 84, root: 55, scale: MAJOR, bars: [0, 5, 3, 4], seed: 6, layers: [
    { kind: 'pad', wave: 'triangle', gain: 0.07, oct: 0 },
    { kind: 'arp', wave: 'sine', gain: 0.1, pat: 'x...x...x...x...', oct: 1, len: 1.4, shape: [0, 2, 1, 2] },
    { kind: 'lead', wave: 'triangle', gain: 0.07, pat: 'x.....x.x.......', oct: 2, len: 1.5 },
    { kind: 'bass', wave: 'sine', gain: 0.14, pat: 'x.......x.......', oct: -1, len: 1.2 }] },

  { name: 'Midnight Circuit', vol: 1.0, bpm: 124, root: 41, scale: MINOR, bars: [0, 0, 5, 6], seed: 7, layers: [
    { kind: 'bass', wave: 'sawtooth', gain: 0.09, pat: 'xxxxxxxxxxxxxxxx', oct: -1, len: 0.5, lp: 380 },
    { kind: 'kick', pat: 'x.......x.......', gain: 0.5 }, { kind: 'hat', pat: '..x...x...x...x.', gain: 0.1 },
    { kind: 'arp', wave: 'square', gain: 0.035, pat: 'x..x..x.x..x..x.', oct: 2, len: 0.3, shape: [0, 2, 1, 2], lp: 1800 },
    { kind: 'pad', wave: 'sawtooth', gain: 0.025, oct: 0, lp: 700 }] },

  { name: 'Ash Peak', vol: 0.62, bpm: 78, root: 38, scale: PHRYG, bars: [0, 0, 1, 0], seed: 8, layers: [
    { kind: 'pad', wave: 'sawtooth', gain: 0.045, oct: -1, lp: 500 },
    { kind: 'tom', pat: 'x..x..x.x..x....', gain: 0.5 }, { kind: 'kick', pat: 'x.......x.......', gain: 0.45 },
    { kind: 'clank', pat: '....x.......x...', gain: 0.1 },
    { kind: 'lead', wave: 'sine', gain: 0.07, pat: 'x.......x.....x.', oct: 1, len: 1.8 }] },

  { name: 'Coastline Cliffs', vol: 2.5, bpm: 104, root: 55, scale: PENT, bars: [0, 2, 3, 2], seed: 9, layers: [
    { kind: 'arp', wave: 'triangle', gain: 0.1, pat: '..x..x..x..x..x.', oct: 1, len: 0.35, shape: [0, 1, 2, 1] },
    { kind: 'lead', wave: 'sine', gain: 0.09, pat: 'x.x...x...x.x...', oct: 2, len: 0.5, bell: true },
    { kind: 'bass', wave: 'triangle', gain: 0.14, pat: 'x.....x.x.....x.', oct: -1, len: 0.6 },
    { kind: 'hat', pat: '..x...x...x...x.', gain: 0.07 }, { kind: 'pad', wave: 'triangle', gain: 0.03, oct: 0 }] },

  { name: 'Skyline Finale', vol: 0.65, bpm: 128, root: 50, scale: MINOR, bars: [0, 5, 2, 6], seed: 10, layers: [
    { kind: 'lead', wave: 'sawtooth', gain: 0.06, pat: 'x..x..x.x..x..x.', oct: 1, len: 0.5, lp: 2400 },
    { kind: 'arp', wave: 'square', gain: 0.035, pat: 'xxxxxxxxxxxxxxxx', oct: 1, len: 0.4, shape: [0, 1, 2, 1], lp: 2000 },
    { kind: 'bass', wave: 'sawtooth', gain: 0.1, pat: 'x.x.x.x.x.x.x.x.', oct: -1, len: 0.55, lp: 700 },
    { kind: 'kick', pat: 'x...x...x...x...', gain: 0.55 }, { kind: 'snare', pat: '....x.......x...', gain: 0.27 }, { kind: 'hat', pat: 'xxxxxxxxxxxxxxxx', gain: 0.05 },
    { kind: 'pad', wave: 'sawtooth', gain: 0.03, oct: 0, lp: 1100 }] },
];
