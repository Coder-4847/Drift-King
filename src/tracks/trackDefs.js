// Turns a spec from src/data/tracks.js into a full track definition (deterministic from seed).

import { TRACKS } from '../data/tracks.js';
import { CHAPTERS } from '../data/chapters.js';
import { generateTrack, paramsFor } from './generator.js';

const byId = new Map(TRACKS.map((t) => [t.id, t]));
const cache = new Map();

export const careerTracks = (chapter) => TRACKS.filter((t) => t.kind === 'career' && t.chapter === chapter);
export const gpTracks = () => TRACKS.filter((t) => t.kind === 'gp');
export const allTracks = () => TRACKS;
export const specOf = (id) => byId.get(id);

export function getTrackDef(id) {
  if (cache.has(id)) return cache.get(id);
  const spec = byId.get(id);
  if (!spec) throw new Error(`Unknown track ${id}`);
  const chapter = CHAPTERS[spec.chapter];
  const P = paramsFor(spec.kind, spec.chapter, spec.level);
  const g = generateTrack(P, spec.seed);
  const def = {
    id, name: spec.name, kind: spec.kind, chapter: spec.chapter, level: spec.level,
    points: g.points, iceZones: g.iceZones, width: P.width, laps: spec.laps, ref: spec.ref,
    theme: chapter.theme,
  };
  cache.set(id, def);
  return def;
}
