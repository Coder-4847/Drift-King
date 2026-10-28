// Arcade car physics. Pure maths (no rendering) so it can run headless in tools/sim.js.
//
// Heading h: forward = (sin h, cos h), right = (-cos h, sin h). Steering right lowers h.
// Velocity is kept in world space; each step it is split into forward / sideways parts so
// grip can bleed off the sideways part.
//
// Drifting is the normal way round a corner at speed: steer hard and the tail lets go. A
// slide is unstable (the slip angle wants to grow), so you hold it with counter-steer; too
// much angle and the car spins out. Braking is the recovery tool: it slows the car and pulls
// the nose back in line. No gas input: the car always accelerates.

import { CAR, SURFACE } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Car {
  constructor(stats = {}) {
    this.stats = { ...CAR, ...stats };
    this.q = {}; // track query scratch / hint
    this.events = [];
    this.reset(0, 0, 0);
  }

  /** Swap handling stats (garage). */
  setStats(stats = {}) { this.stats = { ...CAR, ...stats }; }

  reset(x, z, heading, speed = 0) {
    this.x = x; this.z = z; this.heading = heading;
    this.vx = Math.sin(heading) * speed;
    this.vz = Math.cos(heading) * speed;
    this.yawVel = 0;
    this.kickYaw = 0;
    this.gripBlend = 0;       // looseness of the rear 0..1
    this.spinning = false;
    this.slip = 0;            // signed slip angle (rad), + = nose points left of the travel direction
    this.speed = speed;
    this.drifting = false;
    this.driftActive = false;
    this.driftTime = 0;
    this.driftGrace = 0;
    this.driftScore = 0;      // score of the drift in progress
    this.totalDriftScore = 0; // banked
    this.boostTimer = 0;
    this.boostAdd = 0;
    this.onRoad = true;
    this.prevBrake = 0;
    this.q = {};
    this.events.length = 0;
  }

  get boosting() { return this.boostTimer > 0; }

  /** Position of a rear wheel (side: -1 = left, +1 = right). */
  wheelPos(side, out, back = 1.35, half = 0.85) {
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    out.x = this.x - fx * back + rx * half * side;
    out.z = this.z - fz * back + rz * half * side;
    return out;
  }

  step(inp, dt, track) {
    const S = this.stats;
    const steer = inp.steer, brk = inp.brake;
    const braking = brk > 0.05;
    this.events.length = 0;

    // --- surface -------------------------------------------------------------------
    let onRoad = true;
    if (track) { track.query(this.x, this.z, this.q); onRoad = this.q.onRoad; }
    this.onRoad = onRoad;

    // --- velocity in the car's frame ------------------------------------------------------
    let h = this.heading;
    let fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;
    const V = Math.hypot(this.vx, this.vz);
    const slip0 = Math.atan2(vL, Math.max(vF, 1));   // + = nose points left of the direction of travel
    const slipAbs0 = Math.abs(slip0);
    const speedN = clamp(V / S.maxSpeed, 0, 1.15);

    // --- how loose is the rear? (0 = gripping, 1 = sliding) -------------------------------
    // Slip builds up when you steer hard at speed. Past slipLoose0 the tail lets go; braking
    // or slowing down gives the grip back.
    let target = smoothstep(S.slipLoose0, S.slipLoose1, slipAbs0);
    target *= clamp((V - S.driftMinSpeed * 0.5) / (S.driftMinSpeed * 0.5), 0, 1);
    target *= 1 - S.brakeGrip * brk;
    const rate = target > this.gripBlend ? S.looseRise : S.looseFall;
    this.gripBlend += (target - this.gripBlend) * Math.min(1, rate * dt);
    const loose = this.gripBlend;

    // --- yaw: steering command + what the slide does to the car -------------------------------
    //  * grip: the car straightens itself out (align)
    //  * sliding: the slip makes the nose swing further round (oversteer): this is what you have
    //    to hold back with counter-steer. Braking pulls the nose back in line.
    const steerFactor = clamp(vF / S.steerRefSpeed, S.steerMinFactor, 1);
    const wCmd = -steer * S.steerRate * (1 + S.steerSpeedGain * speedN) * steerFactor * lerp(1, S.slideSteer, loose);
    const wSlide = (S.oversteer * loose - S.align * (1 - loose)) * slip0 * speedN;
    const wBrake = -S.brakeAlign * brk * slip0 * speedN;
    this.wSlide = wSlide + wBrake;                     // read by the AI controller
    const yawTarget = wCmd + wSlide + wBrake;
    this.yawVel += (yawTarget - this.yawVel) * Math.min(1, S.steerResponse * dt);
    this.kickYaw *= Math.exp(-5 * dt);
    h += (this.yawVel + this.kickYaw) * dt;
    this.heading = h;

    fx = Math.sin(h); fz = Math.cos(h); rx = -Math.cos(h); rz = Math.sin(h);
    vF = this.vx * fx + this.vz * fz;
    vL = this.vx * rx + this.vz * rz;

    // --- speed: auto accelerate, brake, surface, boost ------------------------------------
    if (this.boostTimer > 0) this.boostTimer -= dt;
    const boosting = this.boostTimer > 0;
    const maxEff = S.maxSpeed * (onRoad ? 1 : SURFACE.grassMaxSpeedMult) + (boosting ? this.boostAdd : 0);

    let a = S.accel * Math.max(0.12, 1 - vF / maxEff);
    if (boosting) a *= S.boostAccelMult;
    if (braking) a *= 1 - brk;
    if (vF < maxEff) vF = Math.min(maxEff, vF + a * dt);
    else vF += (maxEff - vF) * Math.min(1, 3 * dt);

    if (braking) vF -= Math.min(S.brakeDecel * brk * dt, Math.max(0, vF - S.minBrakeSpeed));
    if (!onRoad) vF -= vF * SURFACE.grassDrag * dt;
    if (vF < 0) vF = 0;

    // --- sideways grip --------------------------------------------------------------------
    const slip = Math.atan2(vL, Math.max(vF, 0.5));
    const slipAbs = Math.abs(slip);
    let g = lerp(S.grip, S.looseGrip, loose) * (onRoad ? (this.q.grip ?? 1) : SURFACE.grassGripMult);
    const vL0 = vL;
    vL *= Math.exp(-g * dt);
    // Gripping tyres turn sideways speed into forward speed (corners don't bleed speed);
    // a loose rear just scrubs it off, and a full spin scrubs a lot.
    const keep = lerp(S.gripSpeedKeep, S.driftSpeedKeep, loose);
    const vFkeep = Math.sqrt(Math.max(0, vF * vF + vL0 * vL0 - vL * vL));
    vF += (vFkeep - vF) * keep;
    if (slipAbs > S.spinSlip) { const k = Math.exp(-S.spinScrub * dt); vF *= k; vL *= k; }

    this.vx = fx * vF + rx * vL;
    this.vz = fz * vF + rz * vL;
    this.speed = Math.hypot(this.vx, this.vz);
    this.slip = slip;
    this.spinning = slipAbs > S.spinSlip;

    // --- drift bookkeeping --------------------------------------------------------------
    const driftingNow = slipAbs > S.driftSlipMin && loose > 0.4 && this.speed > S.driftMinSpeed * 0.7 && !this.spinning;
    this.drifting = driftingNow;
    if (driftingNow) {
      this.driftActive = true;
      this.driftGrace = 0.3;
      this.driftTime += dt;
      // no points for spinning donuts: the score only counts a slide that is still under control
      if (slipAbs < 0.95) this.driftScore += this.speed * slipAbs * S.driftScoreRate * (1 + this.driftTime * 0.3) * dt;
    } else if (this.driftActive) {
      this.driftGrace -= dt;
      if (this.spinning) this.cancelDrift();          // a spin-out wastes the drift
      else if (this.driftGrace <= 0) this.endDrift();
    }

    // --- move + collide ---------------------------------------------------------------------
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (track) this.collide(track);
  }

  cancelDrift() {
    this.driftActive = false; this.driftTime = 0; this.driftScore = 0;
    this.events.push({ type: 'spin' });
  }

  endDrift() {
    const S = this.stats;
    const t = this.driftTime;
    this.driftActive = false;
    if (t >= S.boostMinTime[0]) {
      const tier = t >= S.boostMinTime[1] ? 1 : 0;
      this.boostTimer = S.boostTime[tier];
      this.boostAdd = S.boostSpeed[tier];
      this.events.push({ type: 'boost', tier });
    }
    if (this.driftScore > 0) {
      this.totalDriftScore += this.driftScore;
      this.events.push({ type: 'driftEnd', score: this.driftScore, time: t });
    }
    this.driftTime = 0;
    this.driftScore = 0;
  }

  // Soft wall just outside the grass: bounce back, lose some speed, never a dead stop.
  collide(track) {
    const q = this.q;
    track.query(this.x, this.z, q);
    const limit = track.wallOffset - SURFACE.carRadius;
    if (q.dist <= limit) return;
    const side = Math.sign(q.lat) || 1;
    const ox = q.nx * side, oz = q.nz * side; // outward normal
    this.x = q.cx + ox * limit; // snap back onto the wall line
    this.z = q.cz + oz * limit;
    const vn = this.vx * ox + this.vz * oz;
    if (vn > 0) {
      this.vx -= (1 + SURFACE.wallBounce) * vn * ox;
      this.vz -= (1 + SURFACE.wallBounce) * vn * oz;
      const loss = 1 - SURFACE.wallSpeedLoss * clamp(vn / this.stats.maxSpeed, 0, 1);
      this.vx *= loss; this.vz *= loss;
      this.kickYaw += -side * 0.5 * clamp(vn / 15, 0, 1);
      this.events.push({ type: 'wall', strength: clamp(vn / this.stats.maxSpeed, 0, 1) });
    }
  }
}
