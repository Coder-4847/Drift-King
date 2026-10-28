// Lap / checkpoint tracking for one car on a closed track.
// Progress is the unwrapped distance along the centreline, so a car can only complete a lap
// by driving the whole way round: checkpoints must be passed in order and reversing never
// counts. Also reports "wrong way" when driving against the track direction.

export class Race {
  constructor(track, laps = 1) {
    this.track = track;
    this.laps = laps;
    const L = track.length;
    const count = Math.max(4, Math.min(12, Math.round(L / 150)));
    // checkpoint distances within a lap; the last one is the finish line (= L)
    this.cp = [];
    for (let k = 1; k <= count; k++) this.cp.push((k * L) / (count + 1));
    this.cp.push(L);
    this.reset();
  }

  reset(car) {
    const t = this.track;
    this.time = 0;
    this.lap = 0;              // 0-based current lap
    this.next = 0;             // index into this.cp
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.wrongTimer = 0;
    this.wrongWay = false;
    this.events = [];
    this.prog = 0;
    this.lastS = 0;
    if (car) {
      t.query(car.x, car.z, car.q);
      const s = car.q.s;
      this.lastS = s;
      this.prog = s > t.length / 2 ? s - t.length : s; // spawn just behind the line => small negative
    }
  }

  /** Call once per physics step after car.step(). Fills this.events with { type, ... }. */
  update(car, dt) {
    this.events.length = 0;
    if (this.finished) return this.events;
    const t = this.track, L = t.length;
    this.time += dt;

    const s = car.q.s;
    let d = s - this.lastS;
    d -= Math.round(d / L) * L;
    this.prog += d;
    this.lastS = s;

    while (!this.finished && this.prog >= this.lap * L + this.cp[this.next]) {
      if (this.next < this.cp.length - 1) {
        this.events.push({ type: 'checkpoint', index: this.next, lap: this.lap });
        this.next++;
      } else {
        const lapTime = this.time - this.lapStart;
        this.lapTimes.push(lapTime);
        this.bestLap = Math.min(this.bestLap, lapTime);
        this.lapStart = this.time;
        this.events.push({ type: 'lap', lap: this.lap, lapTime });
        this.lap++;
        this.next = 0;
        if (this.lap >= this.laps) {
          this.finished = true;
          this.finishTime = this.time;
          this.events.push({ type: 'finish', time: this.time });
        }
      }
    }

    // wrong way: moving against the road direction
    const q = car.q;
    const along = car.vx * t.tx[q.idx] + car.vz * t.tz[q.idx];
    if (car.speed > 3 && along < -0.3 * car.speed) this.wrongTimer = Math.min(2, this.wrongTimer + dt);
    else this.wrongTimer = Math.max(0, this.wrongTimer - dt * 2);
    this.wrongWay = this.wrongTimer > 0.7;
    return this.events;
  }

  /** Current lap number for display (1-based, capped at laps). */
  get lapDisplay() { return Math.min(this.lap + 1, this.laps); }
  /** Race distance covered (for standings later). */
  get distance() { return this.prog; }
}
