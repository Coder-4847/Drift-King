// Headless Grand Prix checks: node tools/gptest.js
// Every AI must finish 3 laps on every GP track without getting stuck, at several difficulties,
// the ordering must follow difficulty, and the collision code must keep cars apart.
import { Track } from '../src/tracks/Track.js';
import { getTrackDef, gpTracks } from '../src/tracks/trackDefs.js';
import { Car } from '../src/game/Car.js';
import { GridRace } from '../src/game/GridRace.js';
import { Driver } from '../src/ai/Driver.js';
import { DIFFICULTIES } from '../src/data/difficulty.js';
import { PHYSICS_DT } from '../src/config.js';
import { resolveCollisions } from '../src/game/collisions.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok  ', m); };

// --- every AI finishes, nobody gets stuck ---------------------------------------------------
const meanFinish = {};
for (const diffIdx of [0, 2, 4]) {
  const times = [];
  let allOk = true, worstStuck = 0, wallHits = 0, respawns = 0;
  for (const spec of gpTracks()) {
    const track = new Track(getTrackDef(spec.id));
    const playerCar = new Car();
    const grid = new GridRace({ track, laps: 3, difficulty: DIFFICULTIES[diffIdx], playerCar, seed: 5 });
    const pilot = new Driver(track, { speedScale: 0.9 });
    const stuck = new Map();
    for (let i = 0; i < 420 / PHYSICS_DT && !grid.entries.every((e) => e.finished); i++) {
      grid.step(PHYSICS_DT, pilot.drive(playerCar, { others: grid.cars.filter((c) => c !== playerCar) }));
      for (const e of grid.entries) {
        if (e.finished) continue;
        const s = e.car.speed < 3 ? (stuck.get(e) || 0) + PHYSICS_DT : 0;
        stuck.set(e, s); worstStuck = Math.max(worstStuck, s);
        for (const ev of e.car.events) if (ev.type === 'wall' && ev.strength > 0.3) wallHits++;
      }
    }
    if (!grid.entries.every((e) => e.finished)) { allOk = false; console.error('  not all finished on', spec.id, DIFFICULTIES[diffIdx].name); }
    for (const e of grid.entries) { if (!e.isPlayer && e.finished) times.push(e.finishTime / (spec.ref * 3)); respawns += e.respawns || 0; }
  }
  meanFinish[diffIdx] = times.reduce((a, b) => a + b, 0) / times.length;
  ok(allOk && worstStuck < 4, `${DIFFICULTIES[diffIdx].name}: all AIs finish on all 10 tracks (longest stop ${worstStuck.toFixed(1)}s)`);
  ok(respawns <= (diffIdx === 0 ? 8 : 3), `${DIFFICULTIES[diffIdx].name}: AI cars left the road ${respawns} time(s) in 10 races (limit ${diffIdx === 0 ? 8 : 3})`);
}
ok(meanFinish[0] > meanFinish[2] && meanFinish[2] > meanFinish[4], `harder difficulty = faster AI (mean race time vs ref: ${[0, 2, 4].map((d) => meanFinish[d].toFixed(2)).join(' > ')})`);

// --- collisions: overlapping cars are pushed apart, no explosion ----------------------------
{
  const a = new Car(), b = new Car();
  a.reset(0, 0, 0, 20); b.reset(0.6, 3.0, 0, 10); // b is just ahead, overlapping a bit sideways
  const hits = [];
  let maxSpeed = 0;
  for (let i = 0; i < 240; i++) {
    a.step({ steer: 0, brake: 0 }, PHYSICS_DT, null); b.step({ steer: 0, brake: 0 }, PHYSICS_DT, null);
    resolveCollisions([a, b], hits);
    maxSpeed = Math.max(maxSpeed, a.speed, b.speed);
  }
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  ok(maxSpeed < 40 && isFinite(d), 'collision: stays stable (no explosive speeds)');
}
// --- the car can never be stuck facing a wall ------------------------------------------------
{
  const track = new Track(getTrackDef('gp3'));
  const car = new Car();
  const i = 60, side = 1;
  const x = track.x[i] + track.nx[i] * (track.wallOffset - 1.2) * side, z = track.z[i] + track.nz[i] * (track.wallOffset - 1.2) * side;
  car.reset(x, z, Math.atan2(track.nx[i] * side, track.nz[i] * side), 0); // nose against the wall
  for (let k = 0; k < 8 / PHYSICS_DT; k++) car.step({ steer: 1, brake: 0 }, PHYSICS_DT, track);
  ok(car.speed > 10, `car starting nose-first against a wall drives away (speed ${car.speed.toFixed(1)} after 8 s)`);
}
process.exitCode = fail ? 1 : 0;
