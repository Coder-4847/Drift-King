// Seeded procedural track generator.
//
// A track is a chain of corners (arcs) joined by straights, built like a turtle walk:
//   * corner sizes and directions are drawn from per-chapter / per-difficulty ranges, with a bias to
//     S-bends (a left followed by a right) and a few hairpins
//   * the corners are adjusted so the heading turns exactly 360 degrees in total (a closed loop)
//   * the straight lengths are then nudged (least squares) so the end meets the start
// Most of every track is therefore corners in the drift-sized range, which is what the handling
// model is built for. Bad loops (crossing themselves, too tight, ...) are rejected by the
// validator and the next seed is tried.

import { mulberry32 } from '../rng.js';
import { Track } from './Track.js';
import { CHAPTERS } from '../data/chapters.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Per chapter: corner radius range (m), straight length range (m), corner angle range (rad).
const STYLE = [
  { R: [26, 52], S: [14, 60], A: [0.7, 1.9] },   // 1 Pine Valley   - flowing
  { R: [26, 48], S: [14, 55], A: [0.7, 1.9] },   // 2 Frostbite     - flowing, ice
  { R: [18, 34], S: [12, 48], A: [1.3, 1.75] },  // 3 Neon Downtown - blocky 90 degree streets
  { R: [30, 64], S: [30, 95], A: [0.6, 1.6] },   // 4 Dune Run      - long fast sweepers
  { R: [20, 38], S: [22, 75], A: [1.2, 1.75] },  // 5 Harbor Rush   - blocky
  { R: [22, 48], S: [8, 42], A: [0.7, 2.0] },    // 6 Autumn Ridge  - twisty
  { R: [26, 58], S: [20, 80], A: [0.6, 1.7] },   // 7 Midnight      - highway
  { R: [18, 40], S: [8, 38], A: [0.8, 2.1] },    // 8 Ash Peak      - tight
  { R: [34, 68], S: [14, 58], A: [0.6, 1.6] },   // 9 Coastline     - wide sweepers
  { R: [18, 46], S: [8, 66], A: [0.7, 2.1] },    // 10 Skyline      - mixed, hardest
];

/** Generator parameters for a slot. kind: 'career' (chapter c, level l 0..9) or 'gp' (chapter c). */
export function paramsFor(kind, c, l = 0) {
  const st = STYLE[c];
  if (kind === 'gp') {
    return { corners: 15, hairpins: 1 + (c >= 5 ? 1 : 0), chicanes: 2, radiusScale: 0.9, style: st, width: 15, ice: CHAPTERS[c].ice };
  }
  const g = (c * 10 + l) / 99;      // 0..1 over the whole campaign
  const local = l / 9;              // 0..1 inside the chapter
  return {
    corners: Math.round(lerp(9, 17, g) + local * 1.5),
    hairpins: g < 0.05 ? 0 : clamp(Math.floor(g * 3 + local * 0.9), 0, 3),
    chicanes: l === 0 ? 0 : clamp(Math.floor(g * 2.5 + local * 1.2), 0, 3),
    radiusScale: lerp(0.95, 0.8, g) - local * 0.03,   // early levels: wider corners, later: tighter
    style: st,
    width: lerp(15.5, 12.5, g),
    ice: CHAPTERS[c].ice,
  };
}

function gaussRand(rnd) { return (rnd() + rnd() + rnd() - 1.5) / 1.5; } // roughly -1..1, centred

/** One attempt at a closed loop. Returns null if the closure could not be solved. */
function buildLoop(P, rnd) {
  const { R: Rr, S: Sr, A: Ar } = P.style;
  const n = P.corners;

  // corner list: sign (+1 left / -1 right), radius, angle
  const corners = [];
  let sign = rnd() < 0.5 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    // S-bends: usually flip direction, sometimes keep turning the same way
    if (i > 0) sign = rnd() < 0.62 ? -sign : sign;
    const R = lerp(Rr[0], Rr[1], rnd()) * P.radiusScale;
    const a = lerp(Ar[0], Ar[1], rnd());
    corners.push({ s: sign, R: Math.max(R, 17), a, hairpin: false, chic: false });
  }
  // hairpins: a few corners become near-180 turns with a small radius
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } // seeded Fisher-Yates (same on every engine)
  for (let k = 0; k < P.hairpins; k++) { const c = corners[idx[k]]; c.a = 2.6 + rnd() * 0.45; c.R = Math.max(17, lerp(17, 24, rnd()) * P.radiusScale); c.hairpin = true; }
  // chicanes: replace a corner by a quick S pair (two short opposite turns)
  for (let k = 0; k < P.chicanes && k + P.hairpins < n; k++) {
    const c = corners[idx[P.hairpins + k]];
    c.chic = true; c.a = 0.5 + rnd() * 0.35; c.R = Math.max(18, lerp(20, 30, rnd()) * P.radiusScale);
  }
  // each chicane corner is followed by a mirrored partner
  const list = [];
  for (const c of corners) {
    list.push(c);
    if (c.chic) list.push({ s: -c.s, R: c.R, a: c.a * (0.9 + 0.2 * rnd()), hairpin: false, chic: true, partner: true, short: true });
  }

  // net heading change must be +-360 degrees: steer the angles to it
  const want = TAU;                                       // left-handed overall (mirrored randomly later)
  let net = list.reduce((s, c) => s + c.s * c.a, 0);
  if (net < 0) for (const c of list) c.s = -c.s, net = list.reduce((s2, c2) => s2 + c2.s * c2.a, 0);
  for (let it = 0; it < 12 && Math.abs(net - want) > 1e-4; it++) {
    const free = list.filter((c) => !c.hairpin && !c.chic);
    if (!free.length) return null;
    const d = (want - net) / free.length;
    for (const c of free) c.a = clamp(c.a + c.s * d, 0.3, 2.4);
    net = list.reduce((s, c) => s + c.s * c.a, 0);
  }
  if (Math.abs(net - want) > 0.02) return null;

  // straights before each corner
  const straights = list.map((c) => (c.short ? 4 + rnd() * 6 : lerp(Sr[0], Sr[1], Math.pow(rnd(), 1.3))));
  // heading while driving each straight
  const psi = []; let h = 0;
  for (let i = 0; i < list.length; i++) { psi.push(h); h += list[i].s * list[i].a; }

  // displacement of each arc: forward = (sin h, cos h); the left side is (cos h, -sin h).
  // A turn of sign s about radius R: centre = start + s*R*left(h0); displacement = s*R*(left(h0) - left(h1)).
  let ax = 0, az = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i], h0 = psi[i], h1 = h0 + c.s * c.a;
    c.dx = c.s * c.R * (Math.cos(h0) - Math.cos(h1));
    c.dz = c.s * c.R * (-Math.sin(h0) + Math.sin(h1));
    ax += c.dx; az += c.dz;
  }
  // closure: sum(straight_i * (sin psi_i, cos psi_i)) = -(arc displacement)
  const lo = straights.map((l, i) => (list[i].short ? 3 : Math.max(6, Sr[0] * 0.6)));
  const hi = straights.map((l, i) => (list[i].short ? 16 : Sr[1] * 2.6));
  let L = straights.slice();
  const fixed = new Array(list.length).fill(false);
  for (let round = 0; round < 12; round++) {
    let ex = ax, ez = az;
    for (let i = 0; i < L.length; i++) { ex += L[i] * Math.sin(psi[i]); ez += L[i] * Math.cos(psi[i]); }
    if (Math.hypot(ex, ez) < 0.05) break;
    // minimum-norm correction over the free straights: dL = A^T (A A^T)^-1 (-e)
    let a11 = 0, a12 = 0, a22 = 0;
    for (let i = 0; i < L.length; i++) if (!fixed[i]) { const sx = Math.sin(psi[i]), sz = Math.cos(psi[i]); a11 += sx * sx; a12 += sx * sz; a22 += sz * sz; }
    const det = a11 * a22 - a12 * a12;
    if (Math.abs(det) < 1e-6) return null;
    const rx = -ex, rz = -ez;
    const l1 = (a22 * rx - a12 * rz) / det, l2 = (-a12 * rx + a11 * rz) / det;
    let clipped = false;
    for (let i = 0; i < L.length; i++) {
      if (fixed[i]) continue;
      const v = L[i] + l1 * Math.sin(psi[i]) + l2 * Math.cos(psi[i]);
      const c = clamp(v, lo[i], hi[i]);
      if (c !== v) { fixed[i] = true; clipped = true; }
      L[i] = c;
    }
    if (!clipped && round > 0) break;
  }
  let ex = ax, ez = az;
  for (let i = 0; i < L.length; i++) { ex += L[i] * Math.sin(psi[i]); ez += L[i] * Math.cos(psi[i]); }
  if (Math.hypot(ex, ez) > 0.5) return null;

  // sample the path
  const pts = [];
  let x = 0, z = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i], h0 = psi[i];
    const steps = Math.max(1, Math.round(L[i] / 14));
    for (let k = 0; k < steps; k++) { pts.push([x + (Math.sin(h0) * L[i] * k) / steps, z + (Math.cos(h0) * L[i] * k) / steps]); }
    x += Math.sin(h0) * L[i]; z += Math.cos(h0) * L[i];
    const cx = x + c.s * c.R * Math.cos(h0), cz = z - c.s * c.R * Math.sin(h0);
    const asteps = Math.max(2, Math.round((c.a * c.R) / 7));
    for (let k = 0; k < asteps; k++) {
      const hh = h0 + c.s * c.a * (k / asteps);
      pts.push([cx - c.s * c.R * Math.cos(hh), cz + c.s * c.R * Math.sin(hh)]);
    }
    const h1 = h0 + c.s * c.a;
    x = cx - c.s * c.R * Math.cos(h1); z = cz + c.s * c.R * Math.sin(h1);
  }
  return pts;
}

/** -> { points:[[x,z],...], iceZones:[[s0,s1],...] }  (deterministic for a given seed) */
export function generateTrack(P, seed) {
  const rnd = mulberry32(seed);
  let pts = null;
  for (let attempt = 0; attempt < 60 && !pts; attempt++) pts = buildLoop(P, rnd);
  if (!pts) return { points: [[0, 0], [10, 0], [10, 10]], iceZones: [], failed: true };

  const mirror = seed % 2 === 0 ? -1 : 1;
  pts = pts.map(([x, z]) => [Math.round(x * mirror * 10) / 10, Math.round(z * 10) / 10]);

  // Rotate so control point 0 (the start line) sits in the straightest stretch.
  const tmp = new Track({ name: 'tmp', points: pts, width: P.width });
  const win = Math.round(40 / (tmp.length / tmp.n));
  const bend = (i) => { let s = 0; for (let k = -win; k <= win; k += 2) s += Math.abs(tmp.curv[tmp.wrap(i + k)]); return s; };
  let best = 0, bestV = Infinity;
  for (let pi = 0; pi < pts.length; pi += 1) {
    let bi = 0, bd = Infinity;
    // nearest sample to control point pi (samples near the control point index are enough)
    const guess = Math.round((pi / pts.length) * tmp.n);
    for (let d = -12; d <= 12; d++) {
      const i = tmp.wrap(guess + d);
      const dd = (tmp.x[i] - pts[pi][0]) ** 2 + (tmp.z[i] - pts[pi][1]) ** 2;
      if (dd < bd) { bd = dd; bi = i; }
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
  let guard = 400;
  while (zones.length < want && guard-- > 0) {
    const len = 30 + rnd() * 25;
    const s0 = 60 + rnd() * (L - 120 - len);
    const s1 = s0 + len;
    let ok = zones.every(([a, b]) => s0 > b + 80 || s1 < a - 80);
    for (let i = 0; i < track.n && ok; i++) if (track.s[i] >= s0 && track.s[i] <= s1 && Math.abs(track.curv[i]) > 1 / 45) ok = false;
    if (ok) zones.push([s0, s1]);
  }
  return zones.sort((a, b) => a[0] - b[0]);
}
