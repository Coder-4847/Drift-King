// Lighting, ground, fog and scattered props (trees, rocks, poles) for a track.
// Props are instanced + merged so the whole scene stays a few dozen draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, QUALITY } from '../config.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintGeo(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

function pineGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.28, 0.4, 1.8, 5); trunk.translate(0, 0.9, 0);
  parts.push(paintGeo(trunk, 0x6b4a2e));
  const tiers = [[2.5, 2.6, 1.7], [1.95, 2.4, 3.3], [1.35, 2.2, 4.7]];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 7); cone.translate(0, y, 0);
    parts.push(paintGeo(cone, 0x2f6b3a));
  }
  return mergeGeometries(parts);
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  const jitter = new Map(); // same corner -> same offset, so faces stay joined
  const rnd = mulberry32(7);
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, [0.8 + rnd() * 0.4, 0.55 + rnd() * 0.25, 0.8 + rnd() * 0.4]);
    const j = jitter.get(key);
    p.setXYZ(i, p.getX(i) * j[0], p.getY(i) * j[1], p.getZ(i) * j[2]);
  }
  g.translate(0, 0.35, 0);
  return paintGeo(g, 0x8b8a84);
}

function poleGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.14, 0.18, 7.5, 5); pole.translate(0, 3.75, 0);
  parts.push(paintGeo(pole, 0x5a4634));
  const bar = new THREE.BoxGeometry(2.4, 0.18, 0.18); bar.translate(0, 6.9, 0);
  parts.push(paintGeo(bar, 0x5a4634));
  return mergeGeometries(parts);
}

export class World {
  constructor(scene, track, theme, quality) {
    this.scene = scene;
    this.track = track;
    this.q = QUALITY[quality] || QUALITY.high;
    this.theme = {
      ground: 0x7d8f45, patchA: 0x6f8240, patchB: 0x8da04f, sky: 0xe9d9b8, ...theme,
    };

    scene.background = new THREE.Color(this.theme.sky);
    scene.fog = new THREE.Fog(COLORS.haze, 110, 260);

    this.buildLights();
    this.buildGround();
    this.buildProps();
  }

  buildLights() {
    const scene = this.scene;
    scene.add(new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 1.05));
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.3);
    this.sunOffset = new THREE.Vector3(-46, 30, -30); // low sun = long shadows
    sun.castShadow = this.q.shadows;
    const cam = sun.shadow.camera;
    const R = 62;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 1; cam.far = 220;
    sun.shadow.mapSize.set(this.q.shadowMap, this.q.shadowMap);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    this._lm = new THREE.Matrix4().lookAt(this.sunOffset, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this._lmInv = this._lm.clone().invert();
    this._v = new THREE.Vector3();
  }

  /** Keep the shadow window centred on the car, snapped to shadow-map texels to avoid shimmer. */
  followShadow(x, z) {
    const R = this.sun.shadow.camera.right;
    const texel = (2 * R) / this.q.shadowMap;
    const v = this._v.set(x, 0, z).applyMatrix4(this._lmInv);
    v.x = Math.round(v.x / texel) * texel;
    v.y = Math.round(v.y / texel) * texel;
    v.applyMatrix4(this._lm);
    this.sun.target.position.copy(v);
    this.sun.position.copy(v).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: this.theme.ground }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // Flat colour patches break up the ground without textures.
    const t = this.track;
    const rnd = mulberry32(31);
    const patch = new THREE.CircleGeometry(1, 7); patch.rotateX(-Math.PI / 2);
    const count = Math.round(70 * this.q.props);
    const mesh = new THREE.InstancedMesh(patch, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
    mesh.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rnd() * t.n), side = rnd() < 0.5 ? -1 : 1;
      const off = t.wallOffset + 2 + rnd() * 70;
      const r = 6 + rnd() * 16;
      p.set(t.x[i] + t.nx[i] * off * side, 0.012 + rnd() * 0.01, t.z[i] + t.nz[i] * off * side);
      q.setFromAxisAngle(up, rnd() * 6.28);
      s.set(r, 1, r * (0.6 + rnd() * 0.5));
      m4.compose(p, q, s);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, c.set(rnd() < 0.5 ? this.theme.patchA : this.theme.patchB));
    }
    this.scene.add(mesh);
  }

  /** Random spots outside the walls, kept away from every part of the track. */
  scatter(rnd, count, minOff, maxOff) {
    const t = this.track, out = [], tmp = {};
    let guard = count * 12;
    while (out.length < count && guard-- > 0) {
      const i = Math.floor(rnd() * t.n), side = rnd() < 0.5 ? -1 : 1;
      const off = minOff + Math.pow(rnd(), 1.6) * (maxOff - minOff);
      const x = t.x[i] + t.nx[i] * off * side + (rnd() - 0.5) * 8;
      const z = t.z[i] + t.nz[i] * off * side + (rnd() - 0.5) * 8;
      tmp.valid = false;
      t.query(x, z, tmp);
      if (tmp.dist < minOff) continue;
      out.push([x, z]);
    }
    return out;
  }

  instanced(geo, spots, { scale = [1, 1], tint = [0xffffff], shadow = true } = {}) {
    if (!spots.length) return;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), spots.length);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    const rnd = mulberry32(spots.length * 13 + 5);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    spots.forEach(([x, z, rot], k) => {
      const sc = scale[0] + rnd() * (scale[1] - scale[0]);
      p.set(x, 0, z);
      q.setFromAxisAngle(up, rot ?? rnd() * 6.28);
      s.set(sc, sc * (0.9 + rnd() * 0.3), sc);
      m4.compose(p, q, s);
      mesh.setMatrixAt(k, m4);
      c.set(tint[Math.floor(rnd() * tint.length)]);
      mesh.setColorAt(k, c);
    });
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildProps() {
    const t = this.track, k = this.q.props;
    const rnd = mulberry32(1234);
    const minOff = t.wallOffset + 3;

    this.instanced(pineGeometry(), this.scatter(rnd, Math.round(520 * k), minOff, minOff + 62),
      { scale: [0.8, 1.5], tint: [0xffffff, 0xe8f2dc, 0xd6e6c4, 0xf2f7e8] });
    this.instanced(rockGeometry(), this.scatter(rnd, Math.round(110 * k), t.wallOffset + 1.5, minOff + 50),
      { scale: [0.7, 2.2], tint: [0xffffff, 0xdad6cf, 0xbfbab0] });

    // utility poles along one side, every ~45 m
    const poles = [];
    const step = Math.round(45 / (t.length / t.n));
    for (let i = 0; i < t.n; i += step) {
      poles.push([t.x[i] - t.nx[i] * (t.wallOffset + 2.5), t.z[i] - t.nz[i] * (t.wallOffset + 2.5), t.headingAt(i)]);
    }
    this.instanced(poleGeometry(), poles, { scale: [1, 1] });
  }
}
