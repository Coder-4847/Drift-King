// Re-checks every stored track from its seed: geometry, a drift bot AND a cautious grip bot finish without
// leaving the road, bot lap time matches the stored reference, names unique.  npm run verify
import { allTracks, getTrackDef } from '../src/tracks/trackDefs.js';
import { Track } from '../src/tracks/Track.js';
import { generateTrack, paramsFor } from '../src/tracks/generator.js';
import { checkGeometry, botLap } from '../src/tracks/validate.js';

let bad = 0;
const names = new Set();
for (const spec of allTracks()) {
  const track = new Track(getTrackDef(spec.id));
  // the stored points must still be what the generator makes from the seed (else: run `npm run tracks`)
  const regen = generateTrack(paramsFor(spec.kind, spec.chapter, spec.level), spec.seed);
  const same = regen.points.length * 2 === spec.pts.length && regen.points.every(([x, z], i) => Math.round(x * 10) === spec.pts[i * 2] && Math.round(z * 10) === spec.pts[i * 2 + 1]);
  const geo = checkGeometry(track);
  const bot = botLap(track);
  const problems = [];
  if (!same) problems.push('stored points differ from the generator output for this seed (run npm run tracks)');
  if (!geo.ok) problems.push(...geo.reasons);
  if (!bot.finished || bot.stuck || bot.offRoad > 0 || bot.spins > 0) problems.push('drift bot failed or left the road');
  const safe = botLap(track, { driver: { style: 'grip', cornerEntry: 0.9 } });
  if (!safe.finished || safe.stuck || safe.offRoad > 0) problems.push('cautious grip bot failed or left the road');
  if (Math.abs(bot.time - spec.ref) > 0.02) problems.push(`ref ${spec.ref} != ${bot.time.toFixed(2)}`);
  if (names.has(spec.name)) problems.push('duplicate name');
  names.add(spec.name);
  if (problems.length) { bad++; console.log(spec.id, spec.name, problems.join('; ')); }
}
console.log(bad ? `${bad} track(s) with problems` : `all ${allTracks().length} tracks OK (geometry, bot lap, unique names)`);
process.exitCode = bad ? 1 : 0;
