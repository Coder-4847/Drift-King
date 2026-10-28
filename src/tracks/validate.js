// Track validation: geometry checks (cheap, run anywhere) and a bot lap (proves the track
// can be completed with only steer + brake and gives a reference lap time).

import { Car } from '../game/Car.js';
import { Driver } from '../ai/Driver.js';
import { Race } from '../game/Race.js';
import { PHYSICS_DT } from '../config.js';

export const LIMITS = {
  minRadius: 14,       // m, tightest centreline corner
  minWidth: 10.5,      // m, road width
  minLength: 600,
  maxLength: 2200,
  clearanceMargin: 3,  // m of free space between the walls of distant road sections
};

/** Closest approach between road sections that are far apart along the track. */
export function minClearance(track) {
  const sp = track.length / track.n;
  const skip = Math.ceil(80 / sp);
  let worst = Infinity;
  for (let i = 0; i < track.n; i++) {
    for (let j = i + skip; j < track.n; j++) {
      if (track.n - (j - i) < skip) continue; // close along the loop the other way round
      const d = (track.x[i] - track.x[j]) ** 2 + (track.z[i] - track.z[j]) ** 2;
      if (d < worst) worst = d;
    }
  }
  return Math.sqrt(worst);
}

export function checkGeometry(track) {
  const r = track.minRadius();
  const clearance = minClearance(track);
  const need = track.wallOffset * 2 + LIMITS.clearanceMargin;
  const reasons = [];
  if (r < LIMITS.minRadius) reasons.push(`radius ${r.toFixed(1)}m < ${LIMITS.minRadius}`);
  if (track.width < LIMITS.minWidth) reasons.push(`width ${track.width}`);
  if (track.length < LIMITS.minLength || track.length > LIMITS.maxLength) reasons.push(`length ${track.length.toFixed(0)}`);
  if (clearance < need) reasons.push(`clearance ${clearance.toFixed(1)}m < ${need.toFixed(1)}`);
  return { ok: reasons.length === 0, reasons, minRadius: r, clearance, length: track.length };
}

/** Bot run (`laps` laps) from a standing start at the line. Returns { finished, time, wallHits, stuck }. */
export function botLap(track, { carStats = {}, driver = {}, maxTime = 400, laps = 1 } = {}) {
  const car = new Car(carStats);
  const i0 = track.wrap(-3);
  car.reset(track.x[i0], track.z[i0], track.headingAt(i0), 0);
  const bot = new Driver(track, driver);
  const race = new Race(track, laps);
  race.reset(car);
  let wallHits = 0, stuck = 0, stuckMax = 0, offRoad = 0;
  const steps = Math.round(maxTime / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    car.step(bot.drive(car), PHYSICS_DT, track);
    for (const e of car.events) if (e.type === 'wall' && e.strength > 0.15) wallHits++;
    race.update(car, PHYSICS_DT);
    if (!car.onRoad) offRoad += PHYSICS_DT;
    if (car.speed < 3) { stuck += PHYSICS_DT; stuckMax = Math.max(stuckMax, stuck); } else stuck = 0;
    if (race.finished || stuckMax > 4) break;
  }
  return { finished: race.finished, time: race.finishTime, wallHits, stuck: stuckMax > 4, offRoad };
}
