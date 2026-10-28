// Soft car-to-car bumps (no wrecks). Each car is two circles (nose + tail). Overlaps are pushed
// apart gently, approaching speed is mostly (not fully) cancelled along the contact normal,
// and a small spin is added.

const R = 1.0;       // circle radius
const OFF = 1.05;    // circle centre distance from the car centre
const PUSH = 0.55;   // fraction of the overlap fixed per step
const REST = 0.12;   // bounciness
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const _ = { fx: 0, fz: 0 };

/** cars: array of Car. Returns [{ a, b, strength }] for pairs that hit this step. */
export function resolveCollisions(cars, hits = []) {
  hits.length = 0;
  for (let i = 0; i < cars.length; i++) {
    const A = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const B = cars[j];
      const dx = B.x - A.x, dz = B.z - A.z;
      if (dx * dx + dz * dz > 36) continue; // > 6 m apart
      const afx = Math.sin(A.heading) * OFF, afz = Math.cos(A.heading) * OFF;
      const bfx = Math.sin(B.heading) * OFF, bfz = Math.cos(B.heading) * OFF;
      let best = 0, nx = 0, nz = 0, cax = 0, caz = 0;
      for (const sa of [1, -1]) {
        for (const sb of [1, -1]) {
          const ax = A.x + afx * sa, az = A.z + afz * sa, bx = B.x + bfx * sb, bz = B.z + bfz * sb;
          const ex = bx - ax, ez = bz - az;
          const d = Math.hypot(ex, ez);
          const ov = 2 * R - d;
          if (ov > best) { best = ov; nx = d > 1e-6 ? ex / d : 1; nz = d > 1e-6 ? ez / d : 0; cax = ax - A.x; caz = az - A.z; }
        }
      }
      if (best <= 0) continue;
      // separate (n points from A towards B)
      const push = best * PUSH * 0.5;
      A.x -= nx * push; A.z -= nz * push;
      B.x += nx * push; B.z += nz * push;
      // relative velocity along the normal
      const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      let strength = 0;
      if (vrel < 0) {
        const j = (-(1 + REST) * vrel) / 2;
        A.vx -= j * nx; A.vz -= j * nz;
        B.vx += j * nx; B.vz += j * nz;
        strength = clamp(-vrel / 12, 0, 1);
        const loss = 1 - 0.05 * strength;
        A.vx *= loss; A.vz *= loss; B.vx *= loss; B.vz *= loss;
        // a nudge of spin from where the contact is relative to the centre
        const torque = (cax * nz - caz * nx);
        A.kickYaw += clamp(-torque * 0.5, -1, 1) * strength * 0.8;
        B.kickYaw += clamp(torque * 0.5, -1, 1) * strength * 0.8;
      }
      hits.push({ a: i, b: j, strength });
    }
  }
  return hits;
}
