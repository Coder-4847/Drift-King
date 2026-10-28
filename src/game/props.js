// Low-poly prop geometry. Each builder returns { lit, glow? } where `lit` is a flat-shaded
// merged geometry with vertex colours and `glow` (optional) is an unlit emissive layer.
// Instance tint colours multiply the vertex colours (use near-white vertex colours when the
// tint should pick the hue).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

const merge = (parts) => mergeGeometries(parts.map((p) => { p.deleteAttribute?.('uv'); return p; }));
const cyl = (rt, rb, h, seg, y, hex) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(0, y + h / 2, 0); return paint(g, hex); };
const cone = (r, h, seg, y, hex) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, y + h / 2, 0); return paint(g, hex); };
const box = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return paint(g, hex); };

function hashJitter(geo, seed, ax, ay, az) {
  // jitter shared corners identically so faces stay joined
  const p = geo.attributes.position, map = new Map();
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [1 + (rnd() - 0.5) * ax, 1 + (rnd() - 0.5) * ay, 1 + (rnd() - 0.5) * az]);
    const j = map.get(key);
    p.setXYZ(i, p.getX(i) * j[0], p.getY(i) * j[1], p.getZ(i) * j[2]);
  }
  return geo;
}

export const PROPS = {
  pine({ snow = false, dark = false } = {}) {
    const leaf = dark ? 0x1d3a2e : 0x2f6b3a;
    const parts = [cyl(0.28, 0.4, 1.8, 5, 0, 0x6b4a2e)];
    [[2.5, 2.6, 0.8], [1.95, 2.4, 2.4], [1.35, 2.2, 3.6]].forEach(([r, h, y], i) => {
      parts.push(cone(r, h, 7, y, leaf));
      if (snow) parts.push(cone(r * 0.78, h * 0.62, 7, y + h * 0.42, 0xf4f8fb));
    });
    return { lit: merge(parts) };
  },

  roundTree() {
    const canopy = hashJitter(new THREE.IcosahedronGeometry(2.1, 0), 11, 0.35, 0.25, 0.35);
    canopy.translate(0, 4.2, 0);
    return { lit: merge([cyl(0.3, 0.45, 2.6, 5, 0, 0x6b4a2e), paint(canopy, 0xffffff)]) };
  },

  palm() {
    const parts = [];
    // curved trunk from stacked tilted segments
    for (let i = 0; i < 5; i++) {
      const g = new THREE.CylinderGeometry(0.2 - i * 0.012, 0.24 - i * 0.012, 1.4, 5);
      g.translate(0, 0.7 + i * 1.3, 0); g.rotateZ(0.0); g.translate(i * 0.14, 0, 0);
      parts.push(paint(g, 0x8a6a46));
    }
    for (let k = 0; k < 6; k++) {
      const g = new THREE.ConeGeometry(0.6, 3.4, 3);
      g.rotateZ(Math.PI / 2 + 0.35); g.translate(1.5, 0, 0); g.rotateY((k / 6) * Math.PI * 2);
      g.translate(0.7, 6.9, 0);
      parts.push(paint(g, 0x4a9a3a));
    }
    return { lit: merge(parts) };
  },

  cactus() {
    return { lit: merge([
      cyl(0.45, 0.5, 3.4, 6, 0, 0x4f8a4a),
      box(1.0, 0.5, 0.5, 0.5, 1.4, 0, 0x4f8a4a),
      box(0.5, 1.4, 0.5, 0.95, 1.4, 0, 0x4f8a4a),
      box(0.9, 0.45, 0.45, -0.45, 2.1, 0, 0x4f8a4a),
      box(0.45, 1.1, 0.45, -0.9, 2.1, 0, 0x4f8a4a),
    ]) };
  },

  rock({ color = 0x8b8a84, spiky = false } = {}) {
    let g = spiky ? new THREE.ConeGeometry(1, 2.6, 5) : new THREE.IcosahedronGeometry(1, 0);
    if (spiky) g.translate(0, 1.3, 0);
    else { hashJitter(g, 7, 0.4, 0.3, 0.4); g.scale(1, 0.7, 1); g.translate(0, 0.35, 0); }
    if (spiky) hashJitter(g, 5, 0.3, 0.2, 0.3);
    return { lit: merge([paint(g, color)]) };
  },

  mesa() {
    return { lit: merge([cyl(5.5, 7.5, 7, 7, 0, 0xffffff), cyl(5.7, 5.5, 0.8, 7, 7, 0xe8c090)]) };
  },

  dune() {
    const g = new THREE.SphereGeometry(4, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1.6, 0.5, 1.0);
    return { lit: merge([paint(g, 0xffffff)]) };
  },

  deadTree() {
    return { lit: merge([
      cyl(0.18, 0.32, 3.8, 5, 0, 0x2a2523),
      box(0.14, 1.5, 0.14, 0.5, 2.2, 0, 0x2a2523),
      box(1.2, 0.12, 0.12, 0.1, 2.6, 0, 0x2a2523),
      box(0.12, 1.1, 0.12, -0.5, 2.6, 0, 0x2a2523),
    ]) };
  },

  pole() {
    return { lit: merge([cyl(0.14, 0.18, 7.5, 5, 0, 0x5a4634), box(2.4, 0.18, 0.18, 0, 6.8, 0, 0x5a4634)]) };
  },

  lamp({ glow = 0xffe0a0, tall = false } = {}) {
    const h = tall ? 8.5 : 6.2;
    const lit = merge([cyl(0.12, 0.18, h, 6, 0, 0x4a4e58), box(1.6, 0.14, 0.2, 0.7, h - 0.1, 0, 0x4a4e58)]);
    const headGlow = merge([box(0.7, 0.14, 0.4, 1.35, h - 0.2, 0, glow)]);
    return { lit, glow: headGlow, pool: { color: glow, radius: tall ? 13 : 10, x: 1.35 } };
  },

  sign({ glow = 0xff3ea5 } = {}) {
    return { lit: merge([cyl(0.1, 0.12, 3, 5, 0, 0x30343f), box(3.2, 1.7, 0.2, 0, 3, 0, 0x20232b)]),
      glow: merge([box(2.8, 1.3, 0.12, 0, 3.2, 0.12, glow)]) };
  },

  building({ glow = 0xffd27a, roof = false } = {}) {
    const w = 10, d = 10, h = 16;
    const parts = [box(w, h, d, 0, 0, 0, 0xffffff), box(w + 0.6, 0.5, d + 0.6, 0, h, 0, 0xdcdcdc)];
    if (roof) parts.push(box(2.4, 1.6, 2.4, 2, h + 0.5, 1.5, 0xb8b8b8), box(1.4, 2.2, 1.4, -2.5, h + 0.5, -2, 0xb8b8b8));
    const win = [];
    for (let f = 0; f < 4; f++) for (let k = 0; k < 6; k++) {
      if ((f * 7 + k * 3) % 5 === 0) continue; // some windows dark
      const y = 2 + k * 2.3;
      win.push(box(7.4, 0.9, 0.1, 0, y, d / 2 + 0.05, glow));
      win[win.length - 1].rotateY((f * Math.PI) / 2);
    }
    return { lit: merge(parts), glow: merge(win) };
  },

  container() {
    return { lit: merge([box(2.5, 2.6, 6, 0, 0, 0, 0xffffff), box(2.6, 0.12, 6.1, 0, 1.2, 0, 0xd0d0d0), box(2.6, 0.12, 6.1, 0, 2.5, 0, 0xc0c0c0)]) };
  },

  crane() {
    const col = 0xffffff;
    return { lit: merge([
      box(0.7, 22, 0.7, -5, 0, -2, col), box(0.7, 22, 0.7, -5, 0, 2, col),
      box(0.7, 22, 0.7, 5, 0, -2, col), box(0.7, 22, 0.7, 5, 0, 2, col),
      box(12, 0.8, 5.2, 0, 21, 0, col), box(1.2, 1.2, 36, 0, 22, 12, col),
      box(12, 0.6, 5, 0, 10, 0, 0xcfcfcf),
    ]) };
  },
};
