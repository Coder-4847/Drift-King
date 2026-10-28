// AI / bot driver. Outputs the same { steer, brake } as a human, so it obeys the same physics.
//
// It steers the car's *velocity* along the track: from the look-ahead point it works out how fast
// the direction of travel has to turn, converts that to the slip angle needed to do it, and
// steers to hold that slip angle (the counter-steering a human does by feel).
//   style 'drift': slides tighter corners (slip up to ~45 deg) and keeps the tail under control
//   style 'grip' : stays inside the grip limit (small slip), braking for corners instead
// Difficulty options (see src/data/difficulty.js) add: racing line, braking skill, steering noise,
// mistakes, reaction delay, rubber-banding, car avoidance and bump sensitivity.

import { racingLine } from './line.js';
import { mulberry32 } from '../rng.js';
import { PHYSICS_DT } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Build driver options from a difficulty row (src/data/difficulty.js). */
export function optionsFromDifficulty(d, extra = {}) {
  return {
    speedScale: d.speed,
    cornerEntry: d.cornerEntry,
    brakeFrac: 0.35 + 0.35 * d.brakeSkill,
    lineBlend: d.line,
    style: d.drift >= 0.5 ? 'drift' : 'grip',
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
      style: 'grip',     // 'grip' or 'drift' (see top of file)
      speedScale: 1,     // fraction of the car's max speed it is willing to use
      lane: 0,           // lateral offset from the line (m, + = right)
      lookBase: 8,       // steering look-ahead (m) ...
      lookSpeed: 0.5,    // ... plus this many seconds of travel
      slipGain: 7,       // how hard it corrects the slip angle (1/s); humans react slower, so lower
      curveGain: 2.4,    // how hard it turns the direction of travel towards the look-ahead point
      cornerEntry: 1,    // share of the car's cornering capacity it trusts (lower = brakes earlier)
      brakeFrac: 0.55,   // share of braking power it plans with
      lineBlend: 0,      // 0 = road centre, 1 = racing line
      driftSkill: 1,     // drift style: chance of committing to a slide at each corner (< 1 = sometimes grips)
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
    this.startHold = 0;
    this.psiPrev = null; this.psiRate = 0;
    const qn = Math.round(this.o.reaction / PHYSICS_DT);
    this.queue = qn > 0 ? new Array(qn).fill(null) : null;
    this.qi = 0;
  }

  /** Forget the slide state after being put back on the road. */
  recover() { this.psiPrev = null; this.psiRate = 0; this.queue?.fill(null); this.noiseState = 0; this.disturb = 0; }

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
    const t = this.track, o = this.o, q = car.q, S = car.stats;
    if (!q.valid) t.query(car.x, car.z, q);
    const sp = t.length / t.n;
    const dt = PHYSICS_DT;
    const blend = o.lineBlend;
    const L = this.line;
    const drift = o.style === 'drift';

    // --- lane: base lane + avoidance of cars in front --------------------------------------
    let lane = o.lane;
    if (o.avoid && ctx && ctx.others) lane += this.avoidOffset(car, ctx.others, dt);
    this.avoidLane = lane;

    // --- look-ahead point on the line ---------------------------------------------------------
    const k = Math.max(2, Math.round((o.lookBase + o.lookSpeed * car.speed) / sp));
    const j = t.wrap(q.idx + k);
    const lim = t.halfWidth - 3.2;                              // never aim closer than this to the road edge
    const off = clamp((L ? L.off[j] * blend : 0) + lane, -lim, lim);
    const tx = t.x[j] + t.nx[j] * off, tz = t.z[j] + t.nz[j] * off;
    const dx = tx - car.x, dz = tz - car.z;

    // --- steering ---------------------------------------------------------------------------------
    const V = car.speed;
    const h = car.heading;
    let steer;
    const slip = car.slip;
    if (V < 7) {
      // crawling (start, after a spin): plain pursuit of the nose
      const fwd = dx * Math.sin(h) + dz * Math.cos(h), right = -dx * Math.cos(h) + dz * Math.sin(h);
      steer = clamp(Math.atan2(right, fwd) * 2.4, -1, 1);
      this.psiPrev = null;
    } else {
      const psiV = Math.atan2(car.vx, car.vz);                  // direction of travel
      if (this.psiPrev !== null) this.psiRate += (wrap(psiV - this.psiPrev) / dt - this.psiRate) * Math.min(1, 12 * dt);
      this.psiPrev = psiV;
      const psiT = Math.atan2(dx, dz);                          // direction to the look-ahead point
      const e = wrap(psiT - psiV);
      const need = clamp(e * o.curveGain, -2.2, 2.2);                   // rate the travel direction must turn (rad/s, + = left)
      const gripCap = S.grip * Math.sin(S.slipLoose0 * 0.8);
      let betaT;
      if (!drift || Math.abs(need) < gripCap) {
        betaT = Math.asin(clamp(need / S.grip, -0.5, 0.5));
        if (!drift) betaT = clamp(betaT, -S.slipLoose0 * 0.8, S.slipLoose0 * 0.8);
      } else {
        betaT = Math.sign(need) * Math.asin(Math.min(Math.abs(need) / S.looseGrip, 0.7));
      }
      const wNeed = this.psiRate + o.slipGain * (betaT - slip);          // heading rate that closes the slip error
      const speedN = clamp(V / S.maxSpeed, 0, 1.15);
      const K = S.steerRate * (1 + S.steerSpeedGain * speedN) * clamp(V / S.steerRefSpeed, S.steerMinFactor, 1) * (1 + (S.slideSteer - 1) * car.gripBlend);
      steer = clamp(-(wNeed - car.wSlide) / K, -1, 1);
    }

    // --- speed plan: brake early enough for the tightest corner coming up ---
    let rub = 1;
    if (o.rubber > 0 && ctx && ctx.gap !== undefined) {
      const g = ctx.gap; // + = I am behind the player
      rub = g < 0 ? 1 - o.rubber * 0.22 * Math.min(-g / 120, 1) : 1 + o.rubber * 0.07 * Math.min(g / 120, 1);
    }
    this.rubberScale += (rub - this.rubberScale) * Math.min(1, 2 * dt);
    const vCap = S.maxSpeed * Math.min(1.05, o.speedScale * this.rubberScale) * (1 - 0.35 * this.disturb);
    // how fast the direction of travel can turn: grip limit, or the (bigger) slide limit
    const cap = (drift ? S.looseGrip * Math.sin(0.62) : S.grip * Math.sin(S.slipLoose0 * 0.85)) * o.cornerEntry;
    const dec = S.brakeDecel * o.brakeFrac;
    let brake = 0;
    for (let m = 0; m * sp < 130; m += 3) {
      const idx = t.wrap(q.idx + m);
      let kappa = Math.abs(t.curv[idx]);
      if (L) kappa = kappa * (1 - blend) + Math.abs(L.curv[idx]) * blend;
      if (kappa < 1e-4) continue;
      const vmax = clamp(cap / kappa, S.minBrakeSpeed + 0.5, vCap);
      if (V > vmax) {
        const need = (V * V - vmax * vmax) / (2 * dec);
        if (m * sp <= need + 4) { brake = 1; break; }
      }
    }
    if (V > vCap) brake = 1;
    // recovery: a slide that is about to turn into a spin-out is caught with the brake
    if (Math.abs(slip) > S.spinSlip * 0.82 && V > 9) brake = 1;

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
      else steer += this.mistakeDir * 0.3;
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
