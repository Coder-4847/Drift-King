// Bot driver: follows the track centreline (plus an optional lane offset) and outputs the
// same { steer, brake } as a human. Used to validate tracks now, and as the base of the
// Grand Prix AI in Phase 4. It only ever uses steer + brake, so it obeys the same physics.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Driver {
  constructor(track, opts = {}) {
    this.track = track;
    this.o = {
      speedScale: 1,     // fraction of the car's max speed it is willing to use
      lane: 0,           // lateral offset from the centreline (m, + = right)
      lookBase: 7,       // steering look-ahead (m) ...
      lookSpeed: 0.45,   // ... plus this many seconds of travel
      steerGain: 2.4,
      gripFrac: 0.78,    // share of max turn rate it trusts in corners (lower = brakes earlier)
      brakeFrac: 0.55,   // share of braking power it plans with
      ...opts,
    };
    this.out = { steer: 0, brake: 0 };
  }

  drive(car) {
    const t = this.track, o = this.o, q = car.q;
    if (!q.valid) t.query(car.x, car.z, q);
    const sp = t.length / t.n;

    // --- steering: aim at a point ahead on the line ---
    const k = Math.max(2, Math.round((o.lookBase + o.lookSpeed * car.speed) / sp));
    const j = t.wrap(q.idx + k);
    const tx = t.x[j] + t.nx[j] * o.lane, tz = t.z[j] + t.nz[j] * o.lane;
    const dx = tx - car.x, dz = tz - car.z;
    const h = car.heading;
    const fwd = dx * Math.sin(h) + dz * Math.cos(h);
    const right = -dx * Math.cos(h) + dz * Math.sin(h);
    const err = Math.atan2(right, fwd);
    this.out.steer = clamp(err * o.steerGain, -1, 1);

    // --- speed: brake early enough for the tightest corner coming up ---
    const vCap = car.stats.maxSpeed * o.speedScale;
    const wMax = car.stats.steerRate * o.gripFrac;
    const dec = car.stats.brakeDecel * o.brakeFrac;
    let brake = 0;
    for (let m = 0; m * sp < 120; m += 3) {
      const kappa = Math.abs(t.curv[t.wrap(q.idx + m)]);
      if (kappa < 1e-4) continue;
      const vmax = clamp(wMax / kappa, car.stats.minBrakeSpeed + 2, vCap);
      if (car.speed > vmax) {
        const need = (car.speed * car.speed - vmax * vmax) / (2 * dec);
        if (m * sp <= need + 4) { brake = 1; break; }
      }
    }
    if (car.speed > vCap) brake = 1;
    this.out.brake = brake;
    return this.out;
  }
}
