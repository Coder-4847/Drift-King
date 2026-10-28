// Turns a Track (centreline samples) into scene geometry: road, edge lines, curbs,
// start line, walls and chevrons. All static pieces are merged into a handful of meshes.

import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import { COLORS } from '../config.js';

const CURB_WIDTH = 1.3;
const CURB_CURVATURE = 1 / 85;   // corners tighter than this get curbs
const CHEVRON_CURVATURE = 1 / 110;
const CHEVRON_SPACING = 9;
const CHEVRON_LOOKAHEAD = 38;    // metres before a corner where arrows start
const PASS_FADE = 14;            // metres over which a passed chevron fades out

const col = (hex) => new THREE.Color(hex);

export class TrackBuilder {
  constructor(track, theme = {}) {
    this.track = track;
    this.theme = {
      asphalt: COLORS.asphalt, edge: COLORS.edgeLine, curbA: COLORS.curbRed, curbB: COLORS.curbWhite,
      wallA: 0xd8d2c2, wallB: 0xb9b3a4, chevron: COLORS.chevron, ...theme,
    };
    this.group = new THREE.Group();
    this.buildRoad();
    this.buildCurbs();
    this.buildStartLine();
    this.buildWalls();
    this.buildChevrons();
  }

  // point on the sample i at lateral offset o (+ = right), height y
  pt(i, o, y) {
    const t = this.track;
    return [t.x[i] + t.nx[i] * o, y, t.z[i] + t.nz[i] * o];
  }

  segments() {
    const t = this.track;
    const count = t.closed ? t.n : t.n - 1;
    return { count, j: (i) => (i + 1) % t.n };
  }

  addMesh(geo, { shadow = false, receive = true, material } = {}) {
    const mat = material || new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  ribbon(g, o0, o1, y, color, every = 1) {
    const { count, j } = this.segments();
    for (let i = 0; i < count; i += every) {
      g.quad(this.pt(i, o0, y), this.pt(i, o1, y), this.pt(j(i), o1, y), this.pt(j(i), o0, y), color);
    }
  }

  buildRoad() {
    const t = this.track, hw = t.halfWidth;
    const g = new GeoBuilder();
    // Road surface: two tones alternate very subtly so the speed reads on straights.
    const a = col(this.theme.asphalt), b = col(this.theme.asphalt).offsetHSL(0, 0, 0.012);
    const { count, j } = this.segments();
    for (let i = 0; i < count; i++) {
      g.quad(this.pt(i, -hw, 0.03), this.pt(i, hw, 0.03), this.pt(j(i), hw, 0.03), this.pt(j(i), -hw, 0.03),
        Math.floor(i / 3) % 2 ? a : b);
    }
    const line = col(this.theme.edge);
    this.ribbon(g, -hw + 0.55, -hw + 0.85, 0.045, line);
    this.ribbon(g, hw - 0.85, hw - 0.55, 0.045, line);
    this.addMesh(g.build());
  }

  buildCurbs() {
    const t = this.track, hw = t.halfWidth, n = t.n;
    const on = new Array(n).fill(false);
    for (let i = 0; i < n; i++) on[i] = Math.abs(t.curv[i]) > CURB_CURVATURE;
    const g = new GeoBuilder();
    const A = col(this.theme.curbA), B = col(this.theme.curbB);
    const { count, j } = this.segments();
    for (let i = 0; i < count; i++) {
      if (!on[i] || !on[j(i)]) continue;
      const side = t.curv[i] > 0 ? -1 : 1; // outside of the turn
      const o0 = side * hw, o1 = side * (hw + CURB_WIDTH);
      const y = 0.07;
      g.quad(this.pt(i, o0, y), this.pt(i, o1, y), this.pt(j(i), o1, y), this.pt(j(i), o0, y),
        Math.floor(i / 2) % 2 ? A : B);
    }
    if (g.pos.length) this.addMesh(g.build());
  }

  buildStartLine() {
    const t = this.track, hw = t.halfWidth;
    const g = new GeoBuilder();
    const cols = 14, rows = 2, depth = 1.1;
    const w = (hw * 2) / cols;
    const i = 0;
    const cx = t.x[i], cz = t.z[i], tx = t.tx[i], tz = t.tz[i], nx = t.nx[i], nz = t.nz[i];
    const W = col(0xf4f1ea), K = col(0x1d1d22);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o0 = -hw + c * w, o1 = o0 + w, d0 = (r - 1) * depth, d1 = d0 + depth;
        const P = (o, d) => [cx + nx * o + tx * d, 0.055, cz + nz * o + tz * d];
        g.quad(P(o0, d0), P(o1, d0), P(o1, d1), P(o0, d1), (r + c) % 2 ? W : K);
      }
    }
    this.addMesh(g.build());
  }

  buildWalls() {
    const t = this.track, off = t.wallOffset;
    const g = new GeoBuilder();
    const A = col(this.theme.wallA), B = col(this.theme.wallB);
    const H = 1.1, T = 0.9;
    const { count, j } = this.segments();
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const c = Math.floor(i / 2) % 2 ? A : B;
        const inner = side * (off), outer = side * (off + T);
        // top
        g.quad(this.pt(i, inner, H), this.pt(i, outer, H), this.pt(j(i), outer, H), this.pt(j(i), inner, H), c);
        // inner face (faces the road)
        const hint = [-side * t.nx[i], 0, -side * t.nz[i]];
        g.quad(this.pt(i, inner, 0), this.pt(i, inner, H), this.pt(j(i), inner, H), this.pt(j(i), inner, 0),
          c.clone().multiplyScalar(0.85), hint);
      }
    }
    this.addMesh(g.build(), { shadow: true });
  }

  buildChevrons() {
    const t = this.track, n = t.n;
    // Max curvature over the next CHEVRON_LOOKAHEAD metres, per sample.
    const ahead = Math.round(CHEVRON_LOOKAHEAD / (t.length / n));
    const spots = [];
    let lastS = -1e9;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let k = 0; k <= ahead; k++) m = Math.max(m, Math.abs(t.curv[(i + k) % n]));
      if (m > CHEVRON_CURVATURE && t.s[i] - lastS >= CHEVRON_SPACING) {
        spots.push(i);
        lastS = t.s[i];
      }
    }
    this.chevronS = spots.map((i) => t.s[i]);
    if (!spots.length) { this.chevrons = null; return; }

    // Arrow head: two slanted quads meeting at the tip (local +z = travel direction).
    const g = new THREE.BufferGeometry();
    const v = [];
    const wing = (sx) => {
      const P = [[0, 0.9], [sx * 1.7, -0.5], [sx * 1.7, -1.25], [0, 0.15]];
      const tris = sx > 0 ? [[0, 1, 2], [0, 2, 3]] : [[0, 2, 1], [0, 3, 2]];
      for (const tr of tris) for (const k of tr) v.push(P[k][0], 0, P[k][1]);
    };
    wing(1); wing(-1);
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.InstancedMesh(g, mat, spots.length);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((i, k) => {
      q.setFromAxisAngle(up, t.headingAt(i));
      p.set(t.x[i], 0.08, t.z[i]);
      m4.compose(p, q, s);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, col(this.theme.chevron));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.chevrons = mesh;
    this.chevronFade = new Float32Array(spots.length).fill(1);
    this._cOn = col(this.theme.chevron);
    this._cOff = col(this.theme.asphalt);
    this._tmp = new THREE.Color();
    this.group.add(mesh);
  }

  /** Fade chevrons the car has passed. carS = distance along the track. */
  updateChevrons(carS) {
    if (!this.chevrons) return;
    const L = this.track.length;
    let dirty = false;
    for (let k = 0; k < this.chevronS.length; k++) {
      let d = this.chevronS[k] - carS;
      d -= Math.round(d / L) * L; // wrap to [-L/2, L/2]
      const f = d >= 0 ? 1 : d > -PASS_FADE ? 1 + d / PASS_FADE : 0;
      if (Math.abs(f - this.chevronFade[k]) > 0.02) {
        this.chevronFade[k] = f;
        this._tmp.copy(this._cOff).lerp(this._cOn, f);
        this.chevrons.setColorAt(k, this._tmp);
        dirty = true;
      }
    }
    if (dirty) this.chevrons.instanceColor.needsUpdate = true;
  }
}
