// Low-poly car built from a few tapered boxes. Front is +z. Colours are flat.

import * as THREE from 'three';

function taperedBox(w, h, d, { topX = 1, topZ = 1, frontTopDrop = 0, shiftZ = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    if (y > 0) {
      p.setX(i, p.getX(i) * topX);
      p.setZ(i, z * topZ + shiftZ);
      if (z > 0) p.setY(i, y - frontTopDrop);
    }
  }
  g.computeVertexNormals();
  return g;
}

export class CarModel {
  constructor(color = 0xe8453c, accent = 0xf4efe6) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();   // leans in slides
    this.group.add(this.body);

    const paint = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const trim = new THREE.MeshLambertMaterial({ color: accent, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1c20, flatShading: true });
    const glass = new THREE.MeshLambertMaterial({ color: 0x2c3a4a, flatShading: true });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.body.add(m);
      return m;
    };

    add(taperedBox(1.9, 0.6, 4.3, { topX: 0.92, frontTopDrop: 0.18 }), paint, 0, 0.62, 0);
    add(taperedBox(1.55, 0.55, 2.1, { topX: 0.8, topZ: 0.72 }), glass, 0, 1.17, -0.25);
    add(new THREE.BoxGeometry(0.34, 0.04, 4.1), trim, 0, 0.95, 0.05);           // racing stripe
    add(new THREE.BoxGeometry(1.9, 0.08, 0.55), dark, 0, 1.12, -2.0);           // spoiler wing
    add(new THREE.BoxGeometry(0.1, 0.35, 0.1), dark, -0.6, 0.95, -1.95);
    add(new THREE.BoxGeometry(0.1, 0.35, 0.1), dark, 0.6, 0.95, -1.95);
    add(new THREE.BoxGeometry(1.5, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 0, 0.72, 2.16); // headlights
    add(new THREE.BoxGeometry(1.5, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), 0, 0.78, -2.16); // tail lights

    // Wheels: front ones sit in pivots so they can turn.
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    this.frontPivots = [];
    for (const sx of [-1, 1]) {
      for (const sz of [1, -1]) {
        const wheel = new THREE.Mesh(wheelGeo, dark);
        wheel.castShadow = true;
        if (sz > 0) {
          const pivot = new THREE.Group();
          pivot.position.set(sx * 1.0, 0.46, 1.4);
          pivot.add(wheel);
          this.group.add(pivot);
          this.frontPivots.push(pivot);
        } else {
          wheel.position.set(sx * 1.0, 0.46, -1.35);
          this.group.add(wheel);
        }
      }
    }
  }

  /** Make the whole car a see-through ghost. */
  ghostify(opacity = 0.38) {
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    });
  }

  /** Sync with the physics car. */
  update(car, steer) {
    const g = this.group;
    g.position.set(car.x, 0, car.z);
    g.rotation.y = car.heading;
    // lean outward in slides, tiny nose dip when braking hard
    this.body.rotation.z = THREE.MathUtils.clamp(car.slip * 0.12, -0.12, 0.12);
    for (const p of this.frontPivots) p.rotation.y = -steer * 0.45;
  }
}
