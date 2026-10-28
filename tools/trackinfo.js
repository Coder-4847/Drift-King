// Prints length / min radius of a track and writes a quick SVG preview.
import { Track } from '../src/tracks/Track.js';
import { TEST_TRACK } from '../src/tracks/testTrack.js';
import { writeFileSync } from 'node:fs';

const t = new Track(TEST_TRACK);
console.log(`${t.name}: samples=${t.n} length=${t.length.toFixed(0)}m minRadius=${t.minRadius().toFixed(1)}m`);
// self-intersection (simple): any two samples further than 40m apart along the track but closer than width
let worst = Infinity;
for (let i = 0; i < t.n; i++) for (let j = i + 1; j < t.n; j++) {
  const ds = Math.min(j - i, t.n - (j - i)) * (t.length / t.n);
  if (ds < 60) continue;
  const d = Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]);
  worst = Math.min(worst, d);
}
console.log(`closest approach between distant parts: ${worst.toFixed(1)}m (need > ${(t.wallOffset * 2 + 4).toFixed(0)}m)`);
const pts = [...Array(t.n).keys()].map((i) => `${-t.x[i]},${-t.z[i]}`).join(' ');
const xs = [...t.x], zs = [...t.z];
const minx = Math.min(...xs.map((x) => -x)) - 30, maxx = Math.max(...xs.map((x) => -x)) + 30;
const minz = Math.min(...zs.map((z) => -z)) - 30, maxz = Math.max(...zs.map((z) => -z)) + 30;
writeFileSync(process.argv[2] || '/tmp/track.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minx} ${minz} ${maxx - minx} ${maxz - minz}" width="600"><rect x="${minx}" y="${minz}" width="100%" height="100%" fill="#222"/><polygon points="${pts}" fill="none" stroke="#fff" stroke-width="${t.width}"/><polygon points="${pts}" fill="none" stroke="#e33" stroke-width="1"/></svg>`);
