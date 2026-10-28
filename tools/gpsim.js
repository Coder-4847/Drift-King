// Headless Grand Prix race: node tools/gpsim.js [trackId] [difficultyIndex]
// A scripted "player" (the plain reference bot with a human-ish skill) races 5 AIs.
import { Track } from '../src/tracks/Track.js';
import { getTrackDef, gpTracks } from '../src/tracks/trackDefs.js';
import { Car } from '../src/game/Car.js';
import { GridRace } from '../src/game/GridRace.js';
import { Driver } from '../src/ai/Driver.js';
import { DIFFICULTIES } from '../src/data/difficulty.js';
import { PHYSICS_DT } from '../src/config.js';
import { fmtTime } from '../src/util/format.js';

export function simulateRace(trackId, diffIndex, { playerSkill = 0.93, seed = 1, maxTime = 400 } = {}) {
  const track = new Track(getTrackDef(trackId));
  const playerCar = new Car();
  const grid = new GridRace({ track, laps: 3, difficulty: DIFFICULTIES[diffIndex], playerCar, seed });
  const pilot = new Driver(track, { speedScale: playerSkill });
  let bumps = 0, walls = 0, steps = Math.round(maxTime / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    const inp = pilot.drive(playerCar, { others: grid.cars.filter((c) => c !== playerCar) });
    grid.step(PHYSICS_DT, inp);
    bumps += grid.bumps.length;
    for (const e of grid.entries) for (const ev of e.car.events) if (ev.type === 'wall' && ev.strength > 0.3) walls++;
    if (grid.playerFinished) break;
  }
  return { grid, results: grid.finalResults(), bumps, walls, time: grid.time };
}

if (process.argv[1].endsWith('gpsim.js')) {
  const id = process.argv[2] || 'gp1';
  const diffs = process.argv[3] !== undefined ? [+process.argv[3]] : [0, 1, 2, 3, 4];
  for (const d of diffs) {
    const r = simulateRace(id, d);
    console.log(`${id} ${DIFFICULTIES[d].name}: bumps=${r.bumps} bigWalls=${r.walls}`);
    console.log('  ' + r.results.map((x) => `${x.position}.${x.entry.name}${x.estimated ? '~' : ''} ${fmtTime(x.time)}`).join(' | '));
  }
}
