// Career rules: node tools/careertest.js
import { progress } from '../src/settings.js';
import * as c from '../src/game/career.js';
import { LEVELS } from '../src/data/levels.js';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const stars = progress.career.stars;
const lvl = (id) => c.levelById(id);

assert(LEVELS.length === 100, '100 career levels');
assert(LEVELS.every((l) => l.gold < l.silver && l.silver < l.bronze), 'gold < silver < bronze for every level');
assert(c.levelUnlocked(0, 0) && !c.levelUnlocked(0, 1), 'fresh save: only level 1 of chapter 1 is open');
assert([0, 1, 2, 9].map((i) => c.starsNeeded(i)).join() === '0,20,40,180', 'chapter N needs 20 x (N-1) stars (0, 20, 40 ... 180)');
assert(!c.chapterUnlocked(1), 'chapter 2 locked at 0 stars');

// finishing with 0 stars does not unlock the next level; 1 star does
let r = c.recordResult(lvl('c1l1'), lvl('c1l1').bronze + 5, 0);
assert(r.stars === 0 && !c.levelUnlocked(0, 1), 'too-slow finish gives 0 stars and keeps level 2 locked');
r = c.recordResult(lvl('c1l1'), lvl('c1l1').bronze - 1, 100);
assert(r.stars === 1 && c.levelUnlocked(0, 1), '1 star unlocks the next level');
r = c.recordResult(lvl('c1l1'), lvl('c1l1').gold - 1, 50);
assert(r.stars === 3 && r.newStars === 2 && c.starsFor('c1l1') === 3, 'improving to gold -> 3 stars, +2 new');
r = c.recordResult(lvl('c1l1'), lvl('c1l1').silver, 10);
assert(c.starsFor('c1l1') === 3 && !r.newBest, 'a worse run never lowers stars or best time');
assert(c.bestDrift('c1l1') === 100, 'best drift score kept');

// total stars -> chapter unlock
for (let i = 1; i <= 7; i++) stars[`c1l${i}`] = 3; // 21 stars
assert(c.totalStars() === 21 + 0 && c.chapterUnlocked(1) && !c.chapterUnlocked(2), '21 stars: chapter 2 open, chapter 3 locked');
stars.c1l8 = 3; stars.c1l9 = 3; stars.c1l10 = 3; // 30
for (let i = 1; i <= 4; i++) stars[`c2l${i}`] = 3; // +12 = 42
assert(c.chapterUnlocked(2), '42 stars: chapter 3 unlocked');
r = c.recordResult(lvl('c2l5'), lvl('c2l5').gold - 1, 0); // 42 -> 45, nothing new
assert(r.unlockedChapters.length === 0, 'no chapter unlocked when none crossed');
assert(c.nextLevel(lvl('c1l10'))?.id === 'c2l1', 'after level 10 the next level is chapter 2 level 1 when unlocked');
assert(c.nextLevel(lvl('c2l5'))?.id === 'c2l6', 'next level inside a chapter');
stars.c1l1 = 0; for (const k of Object.keys(stars)) delete stars[k];
assert(c.nextLevel(lvl('c1l10')) === null, 'next is null when the next chapter is still locked');
for (let i = 1; i <= 9; i++) stars[`c1l${i}`] = 3; // 27
for (let i = 1; i <= 5; i++) stars[`c2l${i}`] = 1; // 32 ... need unlock check 40 for ch3
stars.c1l10 = 0;
r = c.recordResult(lvl('c1l10'), lvl('c1l10').gold - 1, 0); // +3 -> 35, ch2 was already open
assert(c.chapterStars(0) === 30 && !c.chapterUnlocked(2), 'chapter stars add up (30), chapter 3 still locked at 35');
