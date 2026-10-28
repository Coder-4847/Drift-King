// Turns a spec from src/data/tracks.js into a full track definition. The control points are stored in
// the data file (generated offline by tools/buildTracks.js), so every device gets identical tracks.

import { TRACKS } from '../data/tracks.js';
import { CHAPTERS } from '../data/chapters.js';

const byId = new Map(TRACKS.map((t) => [t.id, t]));
const cache = new Map();

export const careerTracks = (chapter) => TRACKS.filter((t) => t.kind === 'career' && t.chapter === chapter);
export const gpTracks = () => TRACKS.filter((t) => t.kind === 'gp');
export const allTracks = () => TRACKS;
export const specOf = (id) => byId.get(id);

export function pointsOf(spec) {
  const p = [];
  for (let i = 0; i < spec.pts.length; i += 2) p.push([spec.pts[i] / 10, spec.pts[i + 1] / 10]);
  return p;
}

export function getTrackDef(id) {
  if (cache.has(id)) return cache.get(id);
  const spec = byId.get(id);
  if (!spec) throw new Error(`Unknown track ${id}`);
  const def = {
    id, name: spec.name, kind: spec.kind, chapter: spec.chapter, level: spec.level,
    points: pointsOf(spec), iceZones: spec.ice, width: spec.width, laps: spec.laps, ref: spec.ref,
    theme: CHAPTERS[spec.chapter].theme,
  };
  cache.set(id, def);
  return def;
}
