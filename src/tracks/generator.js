// Seeded procedural track generator.
//
// A track is a closed loop described in polar form r(theta): a superellipse base shape
// (stretch / blockiness per chapter) + low harmonics, plus localized bumps that become
// hairpins (tall narrow lobes or bays) and chicanes (a short S-weave). Because r(theta) is
// single valued the loop can never cross itself; tight lobes can still pinch together, which
// the validator catches ("reject and reseed").

import { mulberry32 } from '../rng.js';
import { Track } from './Track.js';
import { CHAPTERS } from '../data/chapters.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Generator parameters for a slot. kind: 'career' (chapter c, level l 0..9) or 'gp' (chapter c). */
export function paramsFor(kind, c, l = 0) {
  const st = CHAPTERS[c].style;
  if (kind === 'gp') {
    const g = 0.35 + 0.03 * c;
    return {
      points: 32, lobes: 4, roughness: 0.3 + st.roughness, scale: 150, stretch: st.stretch, block: st.block,
      hairpins: 1 + (c >= 5 ? 1 : 0), chicanes: 1 + (c % 3 === 2 ? 1 : 0), width: 15.5 - g, ice: CHAPTERS[c].ice,
    };
  }
  const g = (c * 10 + l) / 99;      // 0..1 over the whole campaign
  const local = l / 9;              // 0..1 inside the chapter
  const hairpins = g < 0.06 ? 0 : clamp(Math.floor(g * 3.0 + local * 0.9), 0, 3);
  const chicanes = l === 0 ? 0 : clamp(Math.floor(g * 2.4 + local * 1.2), 0, 3);
  return {
    points: Math.round(26 + g * 10),
    lobes: 3 + Math.floor(g * 3),
    roughness: 0.2 + 0.18 * g + st.roughness + local * 0.04,
    scale: lerp(135, 170, g) + local * 8,
    stretch: st.stretch,
    block: st.block,
    hairpins, chicanes,
    width: lerp(15, 11.5, g),
    ice: CHAPTERS[c].ice,
  };
}

function polar(theta, P, harm, bumps, chic) {
  const a = P.stretch;
  const p = P.block;
  const se = 1 / Math.pow(Math.pow(Math.abs(Math.cos(theta)) / a, p) + Math.pow(Math.abs(Math.sin(theta)), p), 1 / p);
  let h = 1;
  for (const k of harm) h += k.a * Math.cos(k.k * theta + k.ph);
  let r = P.scale * se * Math.max(0.55, h);
  for (const b of bumps) {
    let d = theta - b.t; d = Math.atan2(Math.sin(d), Math.cos(d));
    r += b.h * Math.exp(-0.5 * (d / b.sigma) ** 2);
  }
  for (const c of chic) {
    let d = theta - c.t; d = Math.atan2(Math.sin(d), Math.cos(d));
    r += c.h * Math.exp(-0.5 * (d / 0.11) ** 2);
  }
  return r;
}

/** -> { points:[[x,z],...], iceZones:[[s0,s1],...] }  (deterministic for a given seed) */
export function generateTrack(P, seed) {
  const rnd = mulberry32(seed);
  P = { ...P, stretch: P.stretch * (0.85 + rnd() * 0.35) }; // every seed gets its own proportions
  const harm = [];
  for (let k = 2; k < 2 + P.lobes; k++) {
    harm.push({ k, a: (P.roughness / Math.pow(k - 1, 1.5)) * (0.4 + rnd() * 0.8), ph: rnd() * TAU });
  }

  // Feature slots spread around the loop, in random order.
  const feats = [];
  for (let i = 0; i < P.hairpins; i++) feats.push('hairpin');
  for (let i = 0; i < P.chicanes; i++) feats.push('chicane');
  for (let i = feats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [feats[i], feats[j]] = [feats[j], feats[i]]; }
  const base = rnd() * TAU;
  const bumps = [], chic = [], extra = [];
  feats.forEach((f, i) => {
    const t = base + ((i + 0.5 + (rnd() - 0.5) * 0.5) / feats.length) * TAU;
    if (f === 'hairpin') {
      const sigma = 0.19 + rnd() * 0.07;
      const sign = rnd() < 0.7 ? 1 : -1; // mostly outward lobes, some inward bays
      bumps.push({ t, sigma, h: sign * P.scale * (0.2 + rnd() * 0.14) });
      for (const m of [-1.7, -0.85, 0, 0.85, 1.7]) extra.push(t + m * sigma);
    } else {
      const amp = P.scale * (0.04 + rnd() * 0.02);
      const dir = rnd() < 0.5 ? 1 : -1;
      [-1, 0, 1].forEach((m) => {
        const tj = t + m * 0.26;
        chic.push({ t: tj, h: amp * dir * (m === 0 ? -1 : 1) });
        extra.push(tj);
      });
      extra.push(t - 0.55, t + 0.55);
    }
  });

  // Angles: uniform + extra points near features; drop points that are too close.
  const angles = [];
  for (let i = 0; i < P.points; i++) angles.push((i / P.points) * TAU + (rnd() - 0.5) * 0.04);
  for (const e of extra) angles.push(((e % TAU) + TAU) % TAU);
  angles.sort((x, y) => x - y);
  const kept = [];
  for (const a of angles) {
    const near = extra.some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) < 0.02);
    const isExtra = near;
    if (kept.length && a - kept[kept.length - 1].a < 0.05) { if (isExtra) kept[kept.length - 1] = { a, isExtra }; continue; }
    kept.push({ a, isExtra });
  }
  // thin uniform points that sit inside a feature's span so lobes stay sharp
  const mirror = seed % 2 === 0 ? -1 : 1;
  let pts = kept.map(({ a }) => {
    const r = polar(a, P, harm, bumps, chic);
    return [Math.round(r * Math.cos(a) * mirror * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10];
  });

  // Rotate so control point 0 (the start line) sits in the straightest stretch.
  const tmp = new Track({ name: 'tmp', points: pts, width: P.width });
  const win = Math.round(70 / (tmp.length / tmp.n));
  const bend = (i) => { // total |curvature| in a window ahead of / behind sample i
    let s = 0;
    for (let k = -win; k <= win; k += 3) s += Math.abs(tmp.curv[tmp.wrap(i + k)]);
    return s;
  };
  let best = 0, bestV = Infinity;
  for (let pi = 0; pi < pts.length; pi++) {
    // nearest sample to control point pi
    let bi = 0, bd = Infinity;
    for (let i = 0; i < tmp.n; i++) {
      const d = (tmp.x[i] - pts[pi][0]) ** 2 + (tmp.z[i] - pts[pi][1]) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    const v = bend(bi);
    if (v < bestV) { bestV = v; best = pi; }
  }
  pts = pts.slice(best).concat(pts.slice(0, best));

  const track = new Track({ name: 'tmp', points: pts, width: P.width });
  const iceZones = P.ice ? makeIceZones(track, rnd) : [];
  return { points: pts, iceZones };
}

// 2-4 ice patches on gentle sections of road (never right at the start line).
function makeIceZones(track, rnd) {
  const L = track.length, zones = [];
  const want = 2 + Math.floor(rnd() * 3);
  let guard = 200;
  while (zones.length < want && guard-- > 0) {
    const len = 30 + rnd() * 25;
    const s0 = 60 + rnd() * (L - 120 - len);
    const s1 = s0 + len;
    let ok = zones.every(([a, b]) => s0 > b + 80 || s1 < a - 80);
    for (let i = 0; i < track.n && ok; i++) if (track.s[i] >= s0 && track.s[i] <= s1 && Math.abs(track.curv[i]) > 1 / 70) ok = false;
    if (ok) zones.push([s0, s1]);
  }
  return zones.sort((a, b) => a[0] - b[0]);
}
