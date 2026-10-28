// Grand Prix progress: best finish per track + difficulty, and the paint rewards for wins.

import { progress, save } from '../settings.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { REWARD_COLORS } from '../data/cars.js';
import { gpTracks } from '../tracks/trackDefs.js';

export const bestFinish = (trackId, diff) => progress.gp.best[trackId]?.[DIFFICULTIES[diff].id] || null;
export const rewardUnlocked = (diff) => !!progress.gp.rewards[DIFFICULTIES[diff].id];

/** Number of Grand Prix tracks won (1st place) on a difficulty. */
export function winsOn(diff) {
  const id = DIFFICULTIES[diff].id;
  return gpTracks().filter((t) => progress.gp.best[t.id]?.[id]?.pos === 1).length;
}

/**
 * results: GridRace.finalResults(). Stores the player's finish; returns
 * { pos, points, time, newBest, reward } (reward = paint just unlocked, or null).
 */
export function recordGp(trackId, diff, results) {
  const me = results.find((r) => r.entry.isPlayer);
  const id = DIFFICULTIES[diff].id;
  const bucket = (progress.gp.best[trackId] ||= {});
  const prev = bucket[id];
  const better = !prev || me.position < prev.pos || (me.position === prev.pos && me.time < prev.time);
  if (better) bucket[id] = { pos: me.position, points: me.points, time: me.time };
  let reward = null;
  if (me.position === 1 && !progress.gp.rewards[id]) {
    progress.gp.rewards[id] = true;
    reward = REWARD_COLORS[diff];
  }
  save();
  return { pos: me.position, points: me.points, time: me.time, newBest: better, reward };
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
