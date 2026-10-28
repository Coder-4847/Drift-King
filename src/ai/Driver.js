// AI / bot driver. Outputs the same { steer, brake } as a human, so it obeys the same physics.
// With default options it is the plain "follow the centreline" bot used to validate tracks.
// Difficulty options (see src/data/difficulty.js) add: a racing line, braking skill, steering
// noise, mistakes, reaction delay, rubber-banding, car avoidance and bump sensitivity.

import { racingLine } from './line.js';
import { mulberry32 } from '../rng.js';
import { PHYSICS_DT } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DRIFT_CURV = 1 / 55;   // road corners tighter than ~55 m radius are drifted by skilled drivers

/** Build driver options from a difficulty row (src/data/difficulty.js). */
export function optionsFromDifficulty(d, extra = {}) {
  return {
    speedScale: d.speed,
    gripFrac: d.cornerEntry,
    brakeFrac: 0.35 + 0.35 * d.brakeSkill,
    lineBlend: d.line,
    driftSkill: d.drift,
    noise: d.steerNoise,
    mistake: d.mistake,
    reaction: d.reaction,
    rubber: d.rubber,
    bumpSens: d.bump,
    avoid: true,
    ...extra,
  };
}

export class Driver {
  constructor(track, opts = {}) {
    this.track = track;
    this.o = {
      speedScale: 1,     // fraction of the car's max speed it is willing to use
      lane: 0,           // lateral offset from the line (m, + = right)
      lookBase: 7,       // steering look-ahead (m) ...
      lookSpeed: 0.45,   // ... plus this many seconds of travel
      steerGain: 2.4,
      gripFrac: 0.78,    // share of max turn rate it trusts in corners (lower = brakes earlier)
      brakeFrac: 0.55,   // share of braking power it plans with
      lineBlend: 0,      // 0 = road centre, 1 = racing line
      driftSkill: null,  // null = plain bot (no drift logic); 0..1 = how often it drifts (low: never)
      noise: 0, mistake: 0, reaction: 0, rubber: 0, bumpSens: 0, avoid: false,
      seed: 1,
      ...opts,
    };
    this.rng = mulberry32(this.o.seed * 7919 + 13);
    this.out = { steer: 0, brake: 0 };
    this.line = this.o.lineBlend > 0 ? racingLine(track) : null;
    this.noiseState = 0;
    this.mistakeT = 0; this.mistakeType = null; this.mistakeDir = 1;
    this.wasBraking = false;
    this.avoidLane = 0;
    this.disturb = 0; this.disturbDir = 1;
    this.rubberScale = 1;
    this.driftOn = false; this.driftT = 0; this.driftCool = 0;
    this.startHold = 0;
    const qn = Math.round(this.o.reaction / PHYSICS_DT);
    this.queue = qn > 0 ? new Array(qn).fill(null) : null;
    this.qi = 0;
  }

  /** Hold the brake (= not accelerate) for a moment after GO, to vary the start. */
  setStartDelay(seconds) { this.startHold = seconds; }

  onBump(strength) {
    if (this.o.bumpSens <= 0) return;
    this.disturb = Math.max(this.disturb, strength * this.o.bumpSens);
    this.disturbDir = this.rng() < 0.5 ? -1 : 1;
  }

  gauss() { return (this.rng() + this.rng() + this.rng() - 1.5) * 1.15; }

  /**
   * ctx (optional): { others: [{x,z,vx,vz}], gap } where gap = metres this car is behind the
   * player (negative = ahead), used for rubber-banding.
   */
  drive(car, ctx) {
    const t = this.track, o = this.o, q = car.q;
    if (!q.valid) t.query(car.x, car.z, q);
    const sp = t.length / t.n;
    const dt = PHYSICS_DT;
    const blend = o.lineBlend;
    const L = this.line;

    // --- lane: base lane + avoidance of cars in front --------------------------------------
    let lane = o.lane;
    if (o.avoid && ctx && ctx.others) lane += this.avoidOffset(car, ctx.others, dt);
    this.avoidLane = lane;

    // --- steering: aim at a point ahead on the line ---
    const k = Math.max(2, Math.round((o.lookBase + o.lookSpeed * car.speed) / sp));
    const j = t.wrap(q.idx + k);
    let tx, tz;
    if (L) {
      tx = t.x[j] + t.nx[j] * (L.off[j] * blend + lane);
      tz = t.z[j] + t.nz[j] * (L.off[j] * blend + lane);
    } else {
      tx = t.x[j] + t.nx[j] * lane; tz = t.z[j] + t.nz[j] * lane;
    }
    const dx = tx - car.x, dz = tz - car.z;
    const h = car.heading;
    const fwd = dx * Math.sin(h) + dz * Math.cos(h);
    const right = -dx * Math.cos(h) + dz * Math.sin(h);
    let steer = Math.atan2(right, fwd) * o.steerGain;

    // --- speed plan: brake early enough for the tightest corner coming up ---
    let rub = 1;
    if (o.rubber > 0 && ctx && ctx.gap !== undefined) {
      const g = ctx.gap; // + = I am behind the player
      rub = g < 0 ? 1 - o.rubber * 0.22 * Math.min(-g / 120, 1) : 1 + o.rubber * 0.07 * Math.min(g / 120, 1);
    }
    this.rubberScale += (rub - this.rubberScale) * Math.min(1, 2 * dt);
    const vCap = car.stats.maxSpeed * Math.min(1.05, o.speedScale * this.rubberScale) * (1 - 0.35 * this.disturb);
    const wMax = car.stats.steerRate * o.gripFrac;
    const dec = car.stats.brakeDecel * o.brakeFrac;
    let brake = 0;
    for (let m = 0; m * sp < 120; m += 3) {
      const idx = t.wrap(q.idx + m);
      let kappa = Math.abs(t.curv[idx]);
      if (L) kappa = kappa * (1 - blend) + Math.abs(L.curv[idx]) * blend;
      if (kappa < 1e-4) continue;
      const vmax = clamp(wMax / kappa, car.stats.minBrakeSpeed + 2, vCap);
      if (car.speed > vmax) {
        const need = (car.speed * car.speed - vmax * vmax) / (2 * dec);
        if (m * sp <= need + 4) { brake = 1; break; }
      }
    }
    if (car.speed > vCap) brake = 1;

    // --- mistakes: a late brake or running wide, rolled when a braking zone starts --------
    if (brake && !this.wasBraking && o.mistake > 0 && this.mistakeT <= 0 && this.rng() < o.mistake) {
      this.mistakeType = this.rng() < 0.55 ? 'late' : 'wide';
      this.mistakeT = 0.45 + this.rng() * 0.45;
      this.mistakeDir = this.rng() < 0.5 ? -1 : 1;
    }
    this.wasBraking = !!brake;
    if (this.mistakeT > 0) {
      this.mistakeT -= dt;
      if (this.mistakeType === 'late') brake = 0;
      else steer += this.mistakeDir * 0.55;
    }

    // --- drift technique: in tighter corners, hold the brake while turning (drift), let go at
    //     the exit for a mini-turbo. Skilled drivers do it often; unskilled ones never. ---------
    if (o.driftSkill !== null && o.driftSkill >= 0.3) {
      this.driftCool -= dt;
      let kk = 0; // tightest road corner in the next ~16 m (the road, not the racing line)
      for (let m = 0; m < 8; m++) kk = Math.max(kk, Math.abs(t.curv[t.wrap(q.idx + m)]));
      const sAbs = Math.abs(steer);
      if (!this.driftOn) {
        if (this.driftCool <= 0 && kk > DRIFT_CURV * (1.8 - 1.2 * o.driftSkill) && car.speed > 17 && sAbs > 0.22 && this.mistakeT <= 0) {
          this.driftCool = 1.5; // decide once per corner
          if (this.rng() < o.driftSkill) { this.driftOn = true; this.driftT = 0; }
        }
      } else {
        this.driftT += dt;
        if (this.driftT > 0.45 || car.speed < 13) { this.driftOn = false; this.driftCool = 1.0; }
      }
      if (this.driftOn) {
        brake = 1;
        // turn-in kick: steer hard for a moment so the tail swings out, then follow the line again
        if (this.driftT < 0.3 && steer !== 0) steer = Math.sign(steer) * Math.max(Math.abs(steer), 0.8);
      }
    } else if (brake && o.driftSkill !== null) {
      // low skill: brake first, turn later (no drift) - steering is limited while braking
      const lim = 0.12 + 0.6 * o.driftSkill;
      steer = clamp(steer, -lim, lim);
    }
    if (o.noise > 0) {
      this.noiseState += (-this.noiseState * 3 + this.gauss() * o.noise * 14 * Math.sqrt(dt) * 3) * dt * 3;
      steer += this.noiseState;
    }
    if (this.disturb > 0.001) {
      steer += this.disturbDir * this.disturb * 0.9;
      this.disturb *= Math.exp(-2.2 * dt);
    }
    if (this.startHold > 0) { this.startHold -= dt; brake = 1; }

    steer = clamp(steer, -1, 1);

    // --- reaction delay ---------------------------------------------------------------------
    if (this.queue) {
      const old = this.queue[this.qi];
      this.queue[this.qi] = { steer, brake };
      this.qi = (this.qi + 1) % this.queue.length;
      if (old) { steer = old.steer; brake = old.brake; }
    }
    this.out.steer = steer;
    this.out.brake = brake;
    return this.out;
  }

  // Shift sideways (smoothly) away from a car just ahead in the same lane.
  avoidOffset(car, others, dt) {
    const t = this.track;
    const h = car.heading;
    const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    const room = t.halfWidth - 2.2;
    let want = this.avoidLane - this.o.lane;
    let near = false;
    for (const c of others) {
      const ax = c.x - car.x, az = c.z - car.z;
      const ahead = ax * fx + az * fz;
      if (ahead < 1 || ahead > 26) continue;
      const lat = ax * rx + az * rz;
      if (Math.abs(lat) > 3.4) continue;
      near = true;
      // go to the side with more room, away from the other car
      const dir = Math.abs(lat) < 0.3 ? (this.avoidLane > 0 ? 1 : -1) : lat > 0 ? -1 : 1;
      want = clamp(this.avoidLane + dir * (3.6 - Math.abs(lat)), -room, room) - this.o.lane;
    }
    if (!near) want = 0; // drift back to the own line
    const cur = this.avoidLane - this.o.lane;
    return cur + (want - cur) * Math.min(1, 3 * dt);
  }
}
