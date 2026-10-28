// Lighting, ground, fog and themed props for a track. Props are instanced (one draw call per
// kind per layer) so the scene stays a few dozen draw calls.

import * as THREE from 'three';
import { QUALITY } from '../config.js';
import { mulberry32 } from '../rng.js';
import { PROPS } from './props.js';

export class World {
  /** theme: chapter.theme; propList: chapter.props; density: extra multiplier from the track. */
  constructor(scene, track, theme, propList, quality, density = 1) {
    this.scene = scene;
    this.track = track;
    this.q = QUALITY[quality] || QUALITY.high;
    this.theme = theme;
    this.propList = propList;
    this.density = density * this.q.props;
    this.exposure = theme.exposure ?? 1.05;
    this.keepOut = []; // circles (water / lava) that props avoid

    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.haze, theme.fogNear ?? 110, theme.fogFar ?? 260);

    this.buildLights();
    this.buildGround();
    this.buildProps();
  }

  buildLights() {
    const th = this.theme, scene = this.scene;
    scene.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiI));
    const sun = new THREE.DirectionalLight(th.sun, th.sunI);
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
    const th = this.theme, t = this.track;
    const geo = new THREE.PlaneGeometry(3000, 3000);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: th.ground }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    const rnd = mulberry32(31);
    // flat colour patches (low-poly stand-in for texture)
    this.patches(rnd, Math.round(70 * this.q.props), [th.patchA, th.patchB], { minOff: 2, span: 70, r0: 6, r1: 22, y: 0.012, lambert: true });
    // water (harbor, coast) and lava (ash) pools further out
    if (th.water) this.patches(rnd, Math.round(26 * this.q.props), [th.water], { minOff: 12, span: 90, r0: 22, r1: 60, y: 0.02, lambert: true, keepOut: true });
    if (th.glow) this.patches(rnd, Math.round(34 * this.q.props), [th.glow], { minOff: 5, span: 80, r0: 6, r1: 18, y: 0.02, lambert: false, keepOut: true });
  }

  patches(rnd, count, colors, { minOff, span, r0, r1, y, lambert, keepOut = false }) {
    const t = this.track;
    if (!count) return;
    const geo = new THREE.CircleGeometry(1, 8); geo.rotateX(-Math.PI / 2);
    const mat = lambert ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : new THREE.MeshBasicMaterial({ color: 0xffffff });
    const spots = [];
    let guard = count * 15;
    const tmp = {};
    while (spots.length < count && guard-- > 0) {
      const i = Math.floor(rnd() * t.n), side = rnd() < 0.5 ? -1 : 1;
      const r = r0 + rnd() * (r1 - r0);
      const off = t.wallOffset + minOff + r * (keepOut ? 0.9 : 0) + rnd() * span;
      const x = t.x[i] + t.nx[i] * off * side, z = t.z[i] + t.nz[i] * off * side;
      tmp.valid = false; t.query(x, z, tmp);
      if (keepOut && tmp.dist < t.wallOffset + minOff + r * 0.9) continue;
      spots.push({ x, z, r });
    }
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    mesh.receiveShadow = lambert;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    spots.forEach((sp, k) => {
      p.set(sp.x, y + rnd() * 0.01, sp.z);
      q.setFromAxisAngle(up, rnd() * 6.28);
      s.set(sp.r, 1, sp.r * (0.6 + rnd() * 0.5));
      m4.compose(p, q, s);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, c.set(colors[Math.floor(rnd() * colors.length)]));
      if (keepOut) this.keepOut.push({ x: sp.x, z: sp.z, r: sp.r * 1.15 });
    });
    this.scene.add(mesh);
  }

  inKeepOut(x, z) {
    for (const k of this.keepOut) if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) return true;
    return false;
  }

  /** Spots outside the walls, away from every part of the track. */
  scatter(rnd, count, near, far, spacing = 0) {
    const t = this.track, out = [], tmp = {};
    const minOff = t.wallOffset + near;
    let guard = count * 14;
    while (out.length < count && guard-- > 0) {
      const i = Math.floor(rnd() * t.n), side = rnd() < 0.5 ? -1 : 1;
      const off = minOff + Math.pow(rnd(), 1.5) * (far - near);
      const x = t.x[i] + t.nx[i] * off * side + (rnd() - 0.5) * 8;
      const z = t.z[i] + t.nz[i] * off * side + (rnd() - 0.5) * 8;
      tmp.valid = false; t.query(x, z, tmp);
      if (tmp.dist < minOff) continue;
      if (this.inKeepOut(x, z)) continue;
      if (spacing && out.some((o) => (o[0] - x) ** 2 + (o[1] - z) ** 2 < spacing * spacing)) continue;
      out.push([x, z, t.headingAt(tmp.idx)]);
    }
    return out;
  }

  /** Evenly spaced along the road, alternating sides, just outside the wall. */
  lineUp(every, rnd) {
    const t = this.track, out = [];
    const step = Math.max(2, Math.round(every / (t.length / t.n)));
    let k = 0;
    for (let i = Math.floor(rnd() * step); i < t.n; i += step, k++) {
      const side = k % 2 ? -1 : 1;
      const off = (t.wallOffset + 2.4) * side;
      const x = t.x[i] + t.nx[i] * off, z = t.z[i] + t.nz[i] * off;
      if (this.inKeepOut(x, z)) continue;
      out.push([x, z, t.headingAt(i) + (side < 0 ? Math.PI : 0)]);
    }
    return out;
  }

  addInstances(geo, material, spots, { scale, tint, shadow, rnd, randomRot }) {
    const mesh = new THREE.InstancedMesh(geo, material, spots.length);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    spots.forEach((sp, k) => {
      const sc = scale[0] + sp.u * (scale[1] - scale[0]);
      p.set(sp.x, 0, sp.z);
      q.setFromAxisAngle(up, sp.rot);
      s.set(sc, sc * sp.vy, sc);
      m4.compose(p, q, s);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, c.set(tint[sp.tint % tint.length]));
    });
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildProps() {
    const rnd = mulberry32(1234 + this.track.n);
    for (const spec of this.propList) {
      const build = PROPS[spec.kind];
      if (!build) continue;
      let raw;
      if (spec.every) raw = this.lineUp(spec.every, rnd);
      else {
        const n = Math.round(spec.count * this.density);
        const near = spec.near ?? 2;
        raw = this.scatter(rnd, n, near, spec.far ?? 60, spec.spacing || 0);
      }
      if (!raw.length) continue;
      const spots = raw.map(([x, z, h]) => ({
        x, z, u: rnd(), vy: 0.9 + rnd() * 0.3, tint: Math.floor(rnd() * 1000),
        rot: spec.align === 'track' ? h + (rnd() < 0.5 ? 0 : Math.PI) : (spec.every ? h : rnd() * 6.28),
      }));
      const { lit, glow, pool } = build(spec.opts || {});
      const tint = spec.tint || [0xffffff];
      const scale = spec.scale || [1, 1];
      this.addInstances(lit, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), spots,
        { scale, tint, shadow: true, rnd });
      if (glow) {
        this.addInstances(glow, new THREE.MeshBasicMaterial({ vertexColors: true }), spots,
          { scale, tint: [0xffffff], shadow: false, rnd });
      }
      if (pool) {
        // soft additive light pool on the ground next to each lamp
        const g = new THREE.CircleGeometry(pool.radius, 14);
        g.rotateX(-Math.PI / 2); g.translate(pool.x, 0.07, 0);
        const mat = new THREE.MeshBasicMaterial({ color: pool.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
        this.addInstances(g, mat, spots.map((sp) => ({ ...sp, vy: 1 })), { scale: [1, 1], tint: [0xffffff], shadow: false, rnd });
      }
    }
  }
}
