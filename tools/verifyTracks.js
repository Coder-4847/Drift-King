// Re-checks every stored track from its seed: geometry, bot lap time matches the stored
// reference, names unique.  npm run verify
import { allTracks, getTrackDef } from '../src/tracks/trackDefs.js';
import { Track } from '../src/tracks/Track.js';
import { checkGeometry, botLap } from '../src/tracks/validate.js';

let bad = 0;
const names = new Set();
for (const spec of allTracks()) {
  const track = new Track(getTrackDef(spec.id));
  const geo = checkGeometry(track);
  const bot = botLap(track);
  const problems = [];
  if (!geo.ok) problems.push(...geo.reasons);
  if (!bot.finished || bot.stuck || bot.wallHits > 1) problems.push('bot failed');
  if (Math.abs(bot.time - spec.ref) > 0.02) problems.push(`ref ${spec.ref} != ${bot.time.toFixed(2)}`);
  if (names.has(spec.name)) problems.push('duplicate name');
  names.add(spec.name);
  if (problems.length) { bad++; console.log(spec.id, spec.name, problems.join('; ')); }
}
console.log(bad ? `${bad} track(s) with problems` : `all ${allTracks().length} tracks OK (geometry, bot lap, unique names)`);
process.exitCode = bad ? 1 : 0;
