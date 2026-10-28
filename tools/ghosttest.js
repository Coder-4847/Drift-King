// Ghost recording round-trip: node tools/ghosttest.js
import { Track } from '../src/tracks/Track.js';
import { getTrackDef } from '../src/tracks/trackDefs.js';
import { Car } from '../src/game/Car.js';
import { Driver } from '../src/ai/Driver.js';
import { GhostRecorder, GhostPlayer } from '../src/game/ghost.js';
import { PHYSICS_DT } from '../src/config.js';

const track = new Track(getTrackDef('c3l5'));
const car = new Car(); const i0 = track.wrap(-3);
car.reset(track.x[i0], track.z[i0], track.headingAt(i0), 0);
const bot = new Driver(track), rec = new GhostRecorder();
const truth = [];
let t = 0;
for (let i = 0; i < 40 / PHYSICS_DT; i++) {
  car.step(bot.drive(car), PHYSICS_DT, track); t += PHYSICS_DT;
  rec.sample(t, car);
  if (i % 37 === 0) truth.push({ t, x: car.x, z: car.z, h: car.heading });
}
const packed = rec.pack();
const g = new GhostPlayer(packed);
let maxErr = 0, maxH = 0;
for (const p of truth) {
  const s = g.at(p.t);
  maxErr = Math.max(maxErr, Math.hypot(s.x - p.x, s.z - p.z));
  maxH = Math.max(maxH, Math.abs(Math.atan2(Math.sin(s.heading - p.h), Math.cos(s.heading - p.h))));
}
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok  ', m); };
ok(maxErr < 1.2, `replayed position within ${maxErr.toFixed(2)} m of the real run (10 Hz samples, interpolated)`);
ok(maxH < 0.1, `heading within ${maxH.toFixed(3)} rad`);
ok(packed.length < 8000, `40 s of ghost is ${packed.length} bytes`);
ok(g.at(1000) && isFinite(g.at(1000).x), 'asking past the end holds the last sample');
process.exitCode = fail ? 1 : 0;
