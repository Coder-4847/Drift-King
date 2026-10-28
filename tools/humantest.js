// Can a human-limited driver finish the tracks?  node tools/humantest.js [delay] [analog]
// The bot's steering is passed through what a keyboard player has: reaction delay and digital
// steering (full left / right / none) eased exactly like src/input/Input.js. With `analog` the
// steering stays analog (stick / touch-slider style). It must never leave the road.
import { Track } from '../src/tracks/Track.js';
import { getTrackDef, allTracks } from '../src/tracks/trackDefs.js';
import { Car } from '../src/game/Car.js';
import { Race } from '../src/game/Race.js';
import { Driver } from '../src/ai/Driver.js';
import { PHYSICS_DT } from '../src/config.js';

// `predict`: the driver anticipates like a skilled human: it plans from where the car WILL be once
// the commands it has already given have taken effect (a Smith predictor: forward-simulate the queue).
function cloneCar(car) {
  const c = new Car(car.stats);
  Object.assign(c, car);
  c.q = { ...car.q }; c.events = [];
  return c;
}

export function humanRun(track, { delay = 0.18, digital = true, deadband = 0.3, laps = 1, style = 'drift', speedScale = 0.95, cornerEntry = 0.9, slipGain = 4, curveGain = 1.8, lookBase = 10, lookSpeed = 0.6, predict = false } = {}) {
  const car = new Car(); const i0 = track.wrap(-3);
  car.reset(track.x[i0], track.z[i0], track.headingAt(i0), 0);
  const bot = new Driver(track, { style, speedScale, cornerEntry, slipGain, curveGain, lookBase, lookSpeed });
  const race = new Race(track, laps); race.reset(car);
  const qn = Math.round(delay / PHYSICS_DT);
  const queue = new Array(Math.max(1, qn)).fill(null); let qi = 0;
  let steerDig = 0, spins = 0, wasSpin = false;
  for (let i = 0; i < 400 / PHYSICS_DT && !race.finished; i++) {
    let driven = car;
    if (predict && qn > 0) {
      driven = cloneCar(car);
      for (let k = 0; k < qn; k++) {                       // commands already in flight, oldest first
        const c = queue[(qi + k) % queue.length];
        let st = c ? c.steer : 0, br = c ? c.brake : 0;
        if (digital) { st = Math.abs(st) > deadband ? Math.sign(st) : 0; br = br > 0.5 ? 1 : 0; }
        driven.step({ steer: st, brake: br }, PHYSICS_DT, track);
      }
    }
    const want = bot.drive(driven);
    let { steer, brake } = want;
    // reaction delay
    const old = queue[qi]; queue[qi] = { steer, brake }; qi = (qi + 1) % queue.length;
    if (old && qn > 0) { steer = old.steer; brake = old.brake; }
    if (digital) {
      const target = Math.abs(steer) > deadband ? Math.sign(steer) : 0;
      let rate = target === 0 ? 11 : 7.5;
      if (target !== 0 && Math.sign(steerDig) === -target) rate = 16;
      const diff = target - steerDig;
      steerDig += Math.sign(diff) * Math.min(Math.abs(diff), rate * PHYSICS_DT);
      steer = steerDig;
      brake = brake > 0.5 ? 1 : 0;
    }
    car.step({ steer, brake }, PHYSICS_DT, track);
    race.update(car, PHYSICS_DT);
    if (car.spinning && !wasSpin) spins++; wasSpin = car.spinning;
    if (!car.onRoad) return { ok: false, why: 'left the road', t: race.time, prog: race.prog / track.length, spins };
  }
  return { ok: race.finished, why: race.finished ? '' : 'timeout', t: race.finishTime, spins };
}

if (process.argv[1].endsWith('humantest.js') && process.argv[2] !== '--check') {
  const delay = process.argv[2] !== undefined ? +process.argv[2] : 0.18;
  const digital = process.argv[3] !== 'analog';
  let ok = 0, n = 0; const bad = [];
  for (const s of allTracks()) {
    const track = new Track(getTrackDef(s.id));
    const r = humanRun(track, { delay, digital });
    n++; if (r.ok) ok++; else bad.push(`${s.id}(${(r.prog * 100).toFixed(0)}%)`);
  }
  console.log(`delay ${delay}s, ${digital ? 'digital (keyboard-style)' : 'analog'} steering: ${ok}/${n} tracks finished without leaving the road`);
  if (bad.length) console.log('  failed:', bad.slice(0, 30).join(' '));
}

// npm test: node tools/humantest.js --check
if (process.argv[2] === '--check') {
  let fail = 0;
  const run = (delay, digital) => { let ok = 0, n = 0; for (const s of allTracks()) { n++; if (humanRun(new Track(getTrackDef(s.id)), { delay, digital }).ok) ok++; } return [ok, n]; };
  for (const [delay, digital, min, label] of [[0.10, true, 105, 'skilled keyboard player (0.10 s)'], [0.18, false, 100, 'average stick player (0.18 s, analog)']]) {
    const [ok, n] = run(delay, digital);
    const pass = ok >= min;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}: finishes ${ok}/${n} tracks without leaving the road (need >= ${min})`);
    if (!pass) fail++;
  }
  process.exitCode = fail ? 1 : 0;
}
