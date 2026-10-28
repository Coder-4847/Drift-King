// How fast is each AI difficulty on its own (no traffic, no rubber-banding)?  npm run aitune
// Prints the mean 3-lap time of each level relative to the plain reference bot, next to the
// `pace` the table aims for.
import { Track } from '../src/tracks/Track.js';
import { getTrackDef, gpTracks } from '../src/tracks/trackDefs.js';
import { botLap } from '../src/tracks/validate.js';
import { optionsFromDifficulty } from '../src/ai/Driver.js';
import { DIFFICULTIES } from '../src/data/difficulty.js';

const ids = gpTracks().map((t) => t.id);
const SEEDS = 4;
const tracks = ids.map((id) => new Track(getTrackDef(id)));
const ref = tracks.map((t) => botLap(t, { laps: 3 }).time);
console.log('track  ' + ids.map((i) => i.padStart(6)).join(' ') + '   mean  aim   stuck/wall');
for (const d of DIFFICULTIES) {
  const ratios = []; let bad = 0, wall = 0;
  const row = tracks.map((t, k) => {
    let sum = 0, n = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const r = botLap(t, { laps: 3, driver: { ...optionsFromDifficulty({ ...d, rubber: 0, bump: 0 }, { seed: s }) } });
      if (!r.finished || r.stuck) { bad++; continue; }
      wall += r.wallHits; sum += r.time / ref[k]; n++;
    }
    const m = n ? sum / n : NaN; ratios.push(m); return m;
  });
  const mean = ratios.filter((x) => !isNaN(x)).reduce((a, b) => a + b, 0) / ratios.filter((x) => !isNaN(x)).length;
  console.log(d.name.padEnd(9) + row.map((x) => x.toFixed(2).padStart(6)).join(' ') + `   ${mean.toFixed(2)}  ${d.pace.toFixed(2)}   ${bad}/${wall}`);
}
