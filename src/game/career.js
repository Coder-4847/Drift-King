// Career rules + progress: stars, best times, level / chapter unlocks.
//   * finish a level with >= 1 star -> next level of the same chapter unlocks
//   * chapter N (1-based) needs 20 x (N - 1) stars in total

import { progress, save } from '../settings.js';
import { LEVELS } from '../data/levels.js';
import { CHAPTERS } from '../data/chapters.js';
import { CARS } from '../data/cars.js';

const byId = new Map(LEVELS.map((l) => [l.id, l]));
export const levelsOf = (chapter) => LEVELS.filter((l) => l.chapter === chapter);
export const levelById = (id) => byId.get(id);
export const levelAt = (chapter, level) => byId.get(`c${chapter + 1}l${level + 1}`);

export const starsFor = (id) => progress.career.stars[id] || 0;
export const bestTime = (id) => progress.career.best[id];
export const bestDrift = (id) => progress.career.drift[id] || 0;

export function totalStars() {
  let n = 0;
  for (const l of LEVELS) n += starsFor(l.id);
  return n;
}
export const chapterStars = (chapter) => levelsOf(chapter).reduce((n, l) => n + starsFor(l.id), 0);
export const maxStars = () => LEVELS.length * 3;

export const starsNeeded = (chapter) => CHAPTERS[chapter].starsToUnlock;
export const chapterUnlocked = (chapter) => totalStars() >= starsNeeded(chapter);

export function levelUnlocked(chapter, level) {
  if (!chapterUnlocked(chapter)) return false;
  return level === 0 || starsFor(`c${chapter + 1}l${level}`) >= 1;
}

/** Stars for a finish time: 3 gold, 2 silver, 1 bronze, 0 too slow. */
export function starsForTime(lvl, time) {
  return time <= lvl.gold ? 3 : time <= lvl.silver ? 2 : time <= lvl.bronze ? 1 : 0;
}

/** The level after this one (next in chapter, or first of the next chapter), if unlocked. */
export function nextLevel(lvl) {
  const cand = lvl.level < 9 ? levelAt(lvl.chapter, lvl.level + 1)
    : lvl.chapter < CHAPTERS.length - 1 ? levelAt(lvl.chapter + 1, 0) : null;
  return cand && levelUnlocked(cand.chapter, cand.level) ? cand : null;
}

/** Store a finished run. Returns what changed so the result screen can show it. */
export function recordResult(lvl, time, driftScore) {
  const stars = starsForTime(lvl, time);
  const prevStars = starsFor(lvl.id), prevBest = bestTime(lvl.id);
  const c = progress.career;
  const newBest = prevBest === undefined || time < prevBest;
  if (newBest) c.best[lvl.id] = time;
  if (stars > prevStars) c.stars[lvl.id] = stars;
  if (driftScore > bestDrift(lvl.id)) c.drift[lvl.id] = Math.round(driftScore);
  const before = totalStars() - Math.max(0, stars - prevStars);
  save();
  const after = totalStars();
  // chapters that this result unlocked
  const unlocked = CHAPTERS.map((_, i) => i).filter((i) => starsNeeded(i) > before && starsNeeded(i) <= after);
  const cars = CARS.filter((c) => c.starsToUnlock > before && c.starsToUnlock <= after);
  return { stars, prevStars, prevBest, newBest, newStars: Math.max(0, stars - prevStars), unlockedChapters: unlocked, unlockedCars: cars };
}
