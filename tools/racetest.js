// Sanity checks for lap / checkpoint / wrong-way logic: node tools/racetest.js
import { Car } from '../src/game/Car.js';
import { Driver } from '../src/ai/Driver.js';
import { Race } from '../src/game/Race.js';
import { Track } from '../src/tracks/Track.js';
import { getTrackDef } from '../src/tracks/trackDefs.js';
import { PHYSICS_DT } from '../src/config.js';

const track = new Track(getTrackDef('c4l6'));
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// 1) bot drives 2 laps: laps counted, checkpoints in order
{
  const car = new Car(); const i0 = track.wrap(-3);
  car.reset(track.x[i0], track.z[i0], track.headingAt(i0), 0);
  const bot = new Driver(track), race = new Race(track, 2); race.reset(car);
  const cps = [];
  for (let i = 0; i < 400 / PHYSICS_DT && !race.finished; i++) {
    car.step(bot.drive(car), PHYSICS_DT, track);
    for (const e of race.update(car, PHYSICS_DT)) if (e.type === 'checkpoint') cps.push(e.index);
  }
  assert(race.finished, `bot finishes 2 laps (${race.finishTime.toFixed(1)}s, laps ${race.lapTimes.map((t) => t.toFixed(1))})`);
  const per = race.cp.length - 1;
  assert(cps.length === per * 2 && cps.every((c, k) => c === k % per), `checkpoints hit in order (${cps.length} = 2 x ${per})`);
}

// 2) driving the wrong way triggers the warning and never counts laps
{
  const car = new Car(); const i0 = track.wrap(40);
  car.reset(track.x[i0], track.z[i0], track.headingAt(i0) + Math.PI, 20);
  const race = new Race(track, 1); race.reset(car);
  let warned = false;
  for (let i = 0; i < 3 / PHYSICS_DT; i++) { car.step({ steer: 0, brake: 0 }, PHYSICS_DT, track); race.update(car, PHYSICS_DT); warned ||= race.wrongWay; }
  assert(warned, 'wrong-way warning appears when reversing direction');
  assert(race.lap === 0 && race.next === 0 && !race.finished, 'no checkpoint / lap counted while going backwards');
}
