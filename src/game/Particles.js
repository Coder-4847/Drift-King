// Tyre smoke (flat quads) and skid marks. Both are ring buffers whose motion and fade
// are computed on the GPU from a time uniform, so the CPU only writes new entries.

import * as THREE from 'three';

const NEVER = -1e6;

export class Smoke {
  constructor(capacity) {
    this.cap = capacity;
    this.next = 0;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
    ], 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    this.origin = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 2);
    this.data = new Float32Array(capacity * 4); // birth, life, size, rot
    for (let i = 0; i < capacity; i++) this.data[i * 4] = NEVER;
    this.attrs = {
      aOrigin: new THREE.InstancedBufferAttribute(this.origin, 3),
      aVel: new THREE.InstancedBufferAttribute(this.vel, 2),
      aData: new THREE.InstancedBufferAttribute(this.data, 4),
    };
    for (const [k, a] of Object.entries(this.attrs)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
    geo.instanceCount = capacity;
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xf4f1ea) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        uniform float uTime;
        attribute vec3 aOrigin; attribute vec2 aVel; attribute vec4 aData;
        varying float vAlpha; varying vec2 vUv;
        void main() {
          float age = uTime - aData.x;
          float k = age / aData.y;
          if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float ang = aData.w + k * 1.4;
          float c = cos(ang), s = sin(ang);
          vec2 p = position.xz * aData.z * (0.55 + 1.7 * k);
          p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          vec3 w = aOrigin + vec3(aVel.x, 0.0, aVel.y) * age * (1.0 - 0.5 * k) + vec3(p.x, 0.5 + 0.7 * k, p.y);
          vAlpha = min(k * 10.0, 1.0) * (1.0 - k) * (1.0 - k) * 0.8;
          vUv = position.xz * 2.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vAlpha; varying vec2 vUv;
        void main() {
          float d = max(abs(vUv.x), abs(vUv.y)) * 0.5 + length(vUv) * 0.5;
          gl_FragColor = vec4(uColor, vAlpha * smoothstep(1.0, 0.55, d));
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.dirty = false;
  }

  emit(time, x, z, vx, vz, life = 0.9, size = 1.6) {
    const i = this.next; this.next = (i + 1) % this.cap;
    this.origin[i * 3] = x; this.origin[i * 3 + 1] = 0; this.origin[i * 3 + 2] = z;
    this.vel[i * 2] = vx; this.vel[i * 2 + 1] = vz;
    this.data[i * 4] = time; this.data[i * 4 + 1] = life; this.data[i * 4 + 2] = size; this.data[i * 4 + 3] = Math.random() * 6.28;
    this.dirty = true;
  }

  update(time) {
    this.uniforms.uTime.value = time;
    if (this.dirty) {
      for (const a of Object.values(this.attrs)) a.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear() { for (let i = 0; i < this.cap; i++) this.data[i * 4] = NEVER; this.dirty = true; }
}

export class SkidMarks {
  constructor(segments, life = 14) {
    this.cap = segments;
    this.next = 0;
    this.life = life;
    this.pos = new Float32Array(segments * 4 * 3);
    this.birth = new Float32Array(segments * 4).fill(NEVER);
    const idx = [];
    for (let i = 0; i < segments; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.birthAttr = new THREE.BufferAttribute(this.birth, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aBirth', this.birthAttr);
    geo.setIndex(idx);
    this.uniforms = { uTime: { value: 0 }, uLife: { value: life } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uLife; attribute float aBirth; varying float vA;
        void main() {
          float k = (uTime - aBirth) / uLife;
          vA = (k < 0.0 || k > 1.0) ? 0.0 : 0.5 * (1.0 - k * k);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() { gl_FragColor = vec4(0.07, 0.07, 0.08, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.last = [null, null]; // previous point for each wheel
    this.dirty = false;
  }

  /** Extend the mark of one wheel (0/1) to (x,z); pass null to break the line. */
  add(time, wheel, x, z, width = 0.34) {
    const prev = this.last[wheel];
    if (x === null) { this.last[wheel] = null; return; }
    if (!prev) { this.last[wheel] = { x, z }; return; }
    const dx = x - prev.x, dz = z - prev.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) return;
    const nx = -dz / d * width * 0.5, nz = dx / d * width * 0.5;
    const i = this.next; this.next = (i + 1) % this.cap;
    const y = 0.06, p = this.pos, o = i * 12;
    p[o] = prev.x - nx; p[o + 1] = y; p[o + 2] = prev.z - nz;
    p[o + 3] = prev.x + nx; p[o + 4] = y; p[o + 5] = prev.z + nz;
    p[o + 6] = x + nx; p[o + 7] = y; p[o + 8] = z + nz;
    p[o + 9] = x - nx; p[o + 10] = y; p[o + 11] = z - nz;
    this.birth.fill(time, i * 4, i * 4 + 4);
    this.last[wheel] = { x, z };
    this.dirty = true;
  }

  update(time) {
    this.uniforms.uTime.value = time;
    if (this.dirty) { this.posAttr.needsUpdate = true; this.birthAttr.needsUpdate = true; this.dirty = false; }
  }

  clear() { this.birth.fill(NEVER); this.last = [null, null]; this.dirty = true; }
}
