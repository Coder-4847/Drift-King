// Tiny helper to accumulate flat-coloured triangles into one merged BufferGeometry.

import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() { this.pos = []; this.col = []; }

  tri(a, b, c, color, hint) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (_n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0) { const t = b; b = c; c = t; }
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /** Quad a-b-c-d (in order around the edge); `hint` = direction the face should point. */
  quad(a, b, c, d, color, hint = [0, 1, 0]) {
    this.tri(a, b, c, color, hint);
    this.tri(a, c, d, color, hint);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
