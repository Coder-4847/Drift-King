// A track is data (control points + width) turned into evenly spaced centreline samples.
// Everything else (meshes, collisions, minimap, AI line) is built from these samples.

import * as THREE from 'three';

export const SAMPLE_SPACING = 2; // metres between centreline samples
export const ICE_GRIP = 0.4;     // grip multiplier on ice patches

export class Track {
  /** def: { name, points:[[x,z],...], width, closed?, laps?, ... } */
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.width = def.width;
    this.halfWidth = def.width / 2;
    this.shoulder = def.shoulder ?? 7;                 // grass between road edge and wall
    this.wallOffset = this.halfWidth + this.shoulder;
    this.offRoadOffset = this.halfWidth + 1.2;         // curbs count as road
    this.closed = def.closed !== false;

    const pts = def.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, this.closed, 'centripetal');
    const len = curve.getLength();
    let n = Math.max(8, Math.round(len / SAMPLE_SPACING));
    const sp = curve.getSpacedPoints(n);
    if (this.closed) sp.pop(); // last == first
    n = sp.length;
    this.n = n;
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    sp.forEach((p, i) => { this.x[i] = p.x; this.z[i] = p.z; });

    this.tx = new Float32Array(n); // unit tangent
    this.tz = new Float32Array(n);
    this.nx = new Float32Array(n); // unit RIGHT normal
    this.nz = new Float32Array(n);
    this.s = new Float32Array(n + 1); // cumulative distance, s[n] = total length
    for (let i = 0; i < n; i++) {
      const a = this.prev(i), b = this.next(i);
      let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      if (!this.closed && i === 0) { dx = this.x[1] - this.x[0]; dz = this.z[1] - this.z[0]; }
      if (!this.closed && i === n - 1) { dx = this.x[n - 1] - this.x[n - 2]; dz = this.z[n - 1] - this.z[n - 2]; }
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.nx[i] = -this.tz[i]; this.nz[i] = this.tx[i];
      const j = this.next(i);
      this.s[i + 1] = this.s[i] + Math.hypot(this.x[j] - this.x[i], this.z[j] - this.z[i]);
    }
    this.length = this.s[n];

    // Surface grip multiplier per sample (ice zones from def.iceZones = [[s0, s1], ...]).
    this.grip = new Float32Array(n).fill(1);
    for (const [a, b] of def.iceZones || []) {
      for (let i = 0; i < n; i++) if (this.s[i] >= a && this.s[i] <= b) this.grip[i] = ICE_GRIP;
    }

    // Signed curvature (1/m): positive = right turn. Smoothed over +-3 samples.
    this.curv = new Float32Array(n);
    const ang = (i) => Math.atan2(this.tx[i], this.tz[i]);
    const K = 3;
    for (let i = 0; i < n; i++) {
      const a = (i - K + n) % n, b = (i + K) % n;
      let d = ang(b) - ang(a);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.curv[i] = -d / (2 * K * (this.length / n));
    }
  }

  next(i) { return this.closed ? (i + 1) % this.n : Math.min(i + 1, this.n - 1); }
  prev(i) { return this.closed ? (i - 1 + this.n) % this.n : Math.max(i - 1, 0); }
  wrap(i) { return ((i % this.n) + this.n) % this.n; }

  /** Heading angle (same convention as the car: forward = (sin h, cos h)). */
  headingAt(i) { return Math.atan2(this.tx[i], this.tz[i]); }

  /** Distance along the track at sample i. */
  sAt(i) { return this.s[i]; }

  /**
   * Nearest-centreline query. `out.idx` is used as a search hint and updated, so call it
   * with the same object every frame for each car (cheap local search).
   * Fills: idx, t, lat (signed, + right), dist (|lat|), cx, cz, onRoad, inBounds.
   */
  query(x, z, out) {
    const n = this.n;
    let best = Infinity, bi = 0, bt = 0;
    const search = (from, count) => {
      for (let k = 0; k < count; k++) {
        const i = this.wrap(from + k);
        const j = this.next(i);
        const ax = this.x[i], az = this.z[i];
        const sx = this.x[j] - ax, sz = this.z[j] - az;
        const l2 = sx * sx + sz * sz || 1;
        let t = ((x - ax) * sx + (z - az) * sz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ax + sx * t), dz = z - (az + sz * t);
        const d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; bi = i; bt = t; }
      }
    };
    const hinted = out.idx !== undefined && out.valid;
    if (hinted) {
      const W = 14;
      search(out.idx - W, 2 * W + 1);
      if (best > 30 * 30) { best = Infinity; search(0, n); } // lost: full scan
    } else {
      search(0, n);
    }

    const j = this.next(bi);
    const cx = this.x[bi] + (this.x[j] - this.x[bi]) * bt;
    const cz = this.z[bi] + (this.z[j] - this.z[bi]) * bt;
    const nx = this.nx[bi], nz = this.nz[bi];
    const lat = (x - cx) * nx + (z - cz) * nz;
    out.valid = true;
    out.idx = bi; out.t = bt;
    out.cx = cx; out.cz = cz;
    out.nx = nx; out.nz = nz;       // right normal at the nearest point
    out.lat = lat; out.dist = Math.abs(lat);
    out.onRoad = out.dist <= this.offRoadOffset;
    out.grip = this.grip[bi];
    out.s = this.s[bi] + (this.s[j === 0 && bi === n - 1 ? n : j] - this.s[bi]) * bt;
    return out;
  }

  /** Minimum turn radius along the centreline (for validation). */
  minRadius() {
    let m = 0;
    for (let i = 0; i < this.n; i++) m = Math.max(m, Math.abs(this.curv[i]));
    return m > 0 ? 1 / m : Infinity;
  }
}
