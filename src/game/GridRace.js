// A race of several cars on one track: grid, AI drivers, per-car lap tracking, collisions,
// standings. Pure logic (no rendering) so the game and tools/gpsim.js share it.

import { Car } from './Car.js';
import { Race } from './Race.js';
import { Driver, optionsFromDifficulty } from '../ai/Driver.js';
import { resolveCollisions } from './collisions.js';
import { RIVALS, POINTS } from '../data/difficulty.js';
import { mulberry32 } from '../rng.js';

export class GridRace {
  /**
   * track, laps, difficulty (row of DIFFICULTIES), playerCar (Car), playerSlot (0..5 grid slot)
   * rivals: [{ name, color }] (5), carStats for the AI cars.
   */
  constructor({ track, laps = 3, difficulty, playerCar, playerSlot = 3, seed = 1, rivals = RIVALS, carStats = {} }) {
    this.track = track;
    this.laps = laps;
    this.difficulty = difficulty;
    this.playerSlot = playerSlot;
    this.hits = [];
    this.bumps = []; // collision events of the last step: { entry, strength }
    const rnd = mulberry32(seed * 31 + 7);
    this.rnd = rnd;

    this.entries = [];
    const slots = [0, 1, 2, 3, 4, 5].filter((s) => s !== playerSlot);
    const player = { id: 0, name: 'You', color: null, isPlayer: true, car: playerCar, race: new Race(track, laps), driver: null, slot: playerSlot };
    this.entries.push(player);
    this.player = player;
    rivals.slice(0, 5).forEach((r, i) => {
      const car = new Car(carStats);
      const driver = new Driver(track, optionsFromDifficulty(difficulty, {
        seed: seed * 17 + i * 101 + 3,
        lane: (rnd() - 0.5) * 3,           // each AI has its own preferred lane
      }));
      this.entries.push({ id: i + 1, name: r.name, color: r.color, isPlayer: false, car, race: new Race(track, laps), driver, slot: slots[i] });
    });
    this.cars = this.entries.map((e) => e.car);
    for (const e of this.entries) e.others = this.entries.filter((o) => o !== e).map((o) => o.car);
    this.reset();
  }

  /** Place everyone on the grid, standing still. */
  reset() {
    const t = this.track, sp = t.length / t.n;
    for (const e of this.entries) {
      const row = e.slot >> 1, side = e.slot & 1 ? 1 : -1;
      const dist = 7 + row * 8.5 + (side > 0 ? 4 : 0);
      const i = t.wrap(-Math.round(dist / sp));
      const lat = side * 3.2;
      e.car.reset(t.x[i] + t.nx[i] * lat, t.z[i] + t.nz[i] * lat, t.headingAt(i), 0);
      e.race.reset(e.car);
      e.finished = false;
      e.finishTime = 0;
      e.position = e.slot + 1;
      if (e.driver) e.driver.setStartDelay(0.05 + this.rnd() * (0.05 + this.difficulty.reaction * 2.5));
    }
    this.time = 0;
    this.playerFinishedAt = null;
    this.final = null;
    this.sortStandings();
  }

  /** One physics step. playerInput = { steer, brake }. */
  step(dt, playerInput) {
    this.time += dt;
    const p = this.player;
    const ctx = this._ctx || (this._ctx = { others: null, gap: 0 });
    this.bumps.length = 0;
    for (const e of this.entries) {
      let control = playerInput;
      if (!e.isPlayer) {
        ctx.others = e.others;
        ctx.gap = p.race.prog - e.race.prog;
        control = e.driver.drive(e.car, ctx);
      }
      e.car.step(control, dt, this.track);
      e.race.update(e.car, dt);
      // an AI car that leaves the road is put back on it (the player would lose, a rival just loses time)
      if (!e.isPlayer) {
        e.offT = e.car.onRoad ? 0 : (e.offT || 0) + dt;
        if (e.offT > 0.35) this.respawn(e);
      }
      if (e.race.finished && !e.finished) {
        e.finished = true;
        e.finishTime = e.race.finishTime;
        if (e.isPlayer) this.playerFinishedAt = e.finishTime;
      }
    }
    for (const h of resolveCollisions(this.cars, this.hits)) {
      for (const idx of [h.a, h.b]) {
        const e = this.entries[idx];
        this.bumps.push({ entry: e, strength: h.strength });
        e.driver?.onBump(h.strength);
      }
    }
    this.sortStandings();
  }

  respawn(e) {
    const t = this.track, q = e.car.q;
    const i = q.idx ?? 0;
    e.car.reset(t.x[i], t.z[i], t.headingAt(i), 9);
    e.car.q = {};
    e.driver.recover?.();
    e.offT = 0;
    e.respawns = (e.respawns || 0) + 1;
  }

  sortStandings() {
    const arr = this.entries.slice().sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return b.race.prog - a.race.prog;
    });
    arr.forEach((e, i) => { e.position = i + 1; });
    this.standings = arr;
    return arr;
  }

  get playerFinished() { return this.player.finished; }

  /**
   * When the player has finished: rivals still on track are classified by distance covered
   * (their time is estimated from the remaining distance and speed).
   * Returns [{ entry, position, time, points, estimated }].
   */
  finalResults() {
    if (this.final) return this.final;
    const L = this.track.length, total = this.laps * L;
    const finishedList = this.entries.filter((e) => e.finished).sort((a, b) => a.finishTime - b.finishTime);
    const rest = this.entries.filter((e) => !e.finished).sort((a, b) => b.race.prog - a.race.prog);
    const tNow = this.playerFinishedAt ?? this.time;
    const out = [];
    finishedList.forEach((e) => out.push({ entry: e, time: e.finishTime, estimated: false }));
    rest.forEach((e) => {
      const remaining = Math.max(0, total - e.race.prog);
      out.push({ entry: e, time: tNow + remaining / Math.max(12, e.car.speed), estimated: true });
    });
    out.forEach((r, i) => { r.position = i + 1; r.points = POINTS[i] ?? 0; });
    this.final = out;
    return out;
  }
}
