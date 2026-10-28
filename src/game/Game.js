// Owns the renderer, the fixed-timestep loop, the scene for the current track and the race
// state machine:
//   demo       a bot drives behind the menus (no HUD)
//   countdown  3-2-1-GO, car held on the line
//   racing     player drives, race clock runs
//   finished   run over: the bot rolls the car out while the result screen is prepared
// Menus / game modes live in App.js and talk to this class through a few methods + callbacks.

import * as THREE from 'three';
import { PHYSICS_DT, QUALITY } from '../config.js';
import { settings } from '../settings.js';
import { CARS } from '../data/cars.js';
import { CHAPTERS } from '../data/chapters.js';
import { Car } from './Car.js';
import { CarModel } from './CarModel.js';
import { CameraRig } from './CameraRig.js';
import { Smoke, SkidMarks } from './Particles.js';
import { World } from './World.js';
import { Race } from './Race.js';
import { Track } from '../tracks/Track.js';
import { TrackBuilder } from '../tracks/TrackBuilder.js';
import { getTrackDef } from '../tracks/trackDefs.js';
import { Driver } from '../ai/Driver.js';
import { GridRace } from './GridRace.js';
import { Hud } from '../ui/Hud.js';
import { fmtTime } from '../util/format.js';

const COUNTDOWN = 3.2;      // seconds of 3-2-1 before GO
const FINISH_DELAY = 1.7;   // seconds of roll-out before the result screen

function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.());
  });
}

export class Game {
  constructor({ canvas, hudRoot, input, debug = false, onPauseButton, onAutoPause, onFinish }) {
    this.canvas = canvas;
    this.input = input;
    this.debug = debug;
    this.onFinish = onFinish;
    this.quality = QUALITY[settings.quality] || QUALITY.high;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.hud = new Hud(hudRoot, input, { debug, onPause: () => onPauseButton?.() });

    this.mode = 'demo';
    this.time = 0;       // simulation clock (stops while paused)
    this.acc = 0;
    this.paused = false;
    this.fps = 60;
    this.countdown = 0;
    this.finishTimer = 0;
    this.trackId = null;
    this.grid = null;          // GridRace while a Grand Prix is running
    this.rivalModels = [];
    this.smokeAcc = {};
    this.standingsTimer = 0;

    input.onDevice(() => this.updateTouch());
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));
    const auto = () => { if (this.canPause()) onAutoPause?.(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) auto(); });
    addEventListener('blur', auto);

    this.resize();
  }

  get racing() { return this.mode === 'countdown' || this.mode === 'racing'; }
  canPause() { return this.racing && !this.paused; }

  updateTouch() { this.input.setTouchVisible(this.racing && !this.paused); }

  // ---------------------------------------------------------------- setup
  loadTrack(id, { laps } = {}) {
    const def = getTrackDef(id);
    if (this.trackId === id && (laps ?? def.laps) === this.soloRace.laps) { this.enterDemo(); return; }
    this.trackId = id;
    const chapter = CHAPTERS[def.chapter];
    this.def = def;
    disposeScene(this.scene);
    this.scene = new THREE.Scene();
    this.track = new Track(def);
    this.world = new World(this.scene, this.track, chapter.theme, chapter.props, settings.quality, def.propDensity ?? 1);
    this.renderer.toneMappingExposure = this.world.exposure;
    this.builder = new TrackBuilder(this.track, chapter.theme);
    this.scene.add(this.builder.group);
    this.soloRace = new Race(this.track, laps ?? def.laps);
    this.race = this.soloRace;
    this.grid = null;
    this.rivalModels = [];

    this.smoke = new Smoke(this.quality.smoke);
    this.skids = new SkidMarks(this.quality.skids);
    this.scene.add(this.skids.mesh, this.smoke.mesh);

    const car = CARS[0];
    this.car = new Car(car.stats);
    this.model = new CarModel(car.color, car.accent);
    this.scene.add(this.model.group);

    this.bot = new Driver(this.track, { speedScale: 0.8 });
    this.hud.setTitle(this.track.name);
    this.hud.minimap.setTrack(this.track);
    this.enterDemo();
  }

  /** frac: place the car that far round the lap, rolling; omit for the standing start. */
  placeAtStart(frac = this.debugStart) {
    const t = this.track;
    if (this.grid) {
      this.grid.reset();
    } else {
      const i = t.wrap(frac != null ? Math.floor(frac * t.n) : -3); // debug: ?at=0.3
      this.car.reset(t.x[i], t.z[i], t.headingAt(i), frac != null ? 18 : 0);
      this.race.reset(this.car);
    }
    this.skids.clear();
    this.smoke.clear();
    this.acc = 0;
    this.smokeAcc = {};
    this.steerShown = 0;
    this.rig.snap(this.car);
    this.world.followShadow(this.car.x, this.car.z);
  }

  clearGrid() {
    for (const m of this.rivalModels) this.scene.remove(m.group);
    this.rivalModels = [];
    this.grid = null;
    this.race = this.soloRace;
  }

  /** Six cars on the grid: the player plus five AI rivals of the given difficulty. */
  setupGrid(difficulty) {
    this.clearGrid();
    this.grid = new GridRace({
      track: this.track, laps: 3, difficulty, playerCar: this.car, playerSlot: 3, seed: 1 + Math.floor(Math.random() * 1e6),
    });
    this.race = this.grid.player.race;
    for (const e of this.grid.entries) {
      if (e.isPlayer) continue;
      const m = new CarModel(e.color, 0xf4efe6);
      e.model = m;
      this.scene.add(m.group);
      this.rivalModels.push(m);
    }
  }

  enterDemo() {
    this.clearGrid();
    this.mode = 'demo';
    this.paused = false;
    this.bot.o.speedScale = 0.8;
    this.placeAtStart(this.debugStart ?? Math.random() * 0.9); // menu background starts somewhere on the lap
    this.hud.setVisible(false);
    this.hud.hideHints();
    this.updateTouch();
  }

  /** Reset to the grid and run the 3-2-1 countdown, then the clock starts. */
  startRace(gp = null) {
    if (gp) this.setupGrid(gp.difficulty); else this.clearGrid();
    this.placeAtStart();
    this.mode = 'countdown';
    this.paused = false;
    this.countdown = COUNTDOWN;
    this.finishTimer = 0;
    this.hud.setVisible(true);
    this.hud.setGp(!!this.grid);
    this.hud.setBig(fmtTime(0));
    this.hud.setLap(this.race.laps > 1 ? `LAP 1/${this.race.laps}` : '');
    this.hud.setWrongWay(false);
    this.hud.hideHints();
    this.hud.driftReset();
    if (this.grid) this.updateStandings(true);
    this.updateTouch();
  }

  pause() { if (!this.canPause()) return false; this.paused = true; this.updateTouch(); return true; }
  resume() { this.paused = false; this.last = performance.now(); this.updateTouch(); }

  // ---------------------------------------------------------------- loop
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
  }

  start() {
    this.last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.1);
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    const inp = this.input.update(dt);
    if (!this.paused) {
      this.time += dt;
      this.stepMode(dt);
      this.acc += dt;
      while (this.acc >= PHYSICS_DT) {
        this.acc -= PHYSICS_DT;
        this.simStep(inp);
      }
      this.effects(dt);
    }
    this.draw(dt, inp);
  }

  stepMode(dt) {
    if (this.mode === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - (COUNTDOWN - 3));
      if (this.countdown > COUNTDOWN - 3) this.hud.countdown(String(n));
      else if (this.countdown > 0) this.hud.countdown(null);
      if (this.countdown <= 0) {
        this.mode = 'racing';
        this.hud.countdown('GO!', 0.7);
        this.hud.showHints();
      }
    } else if (this.mode === 'finished') {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0 && !this.reported) {
        this.reported = true;
        this.onFinish?.({
          time: this.race.finishTime, lapTimes: this.race.lapTimes, driftScore: this.car.totalDriftScore + this.car.driftScore,
          standings: this.grid ? this.grid.finalResults() : null,
        });
      }
    }
  }

  simStep(inp) {
    const car = this.car;
    if (this.mode === 'countdown') return; // held on the grid
    const control = this.mode === 'racing' ? inp : this.bot.drive(car);
    if (this.grid) {
      this.grid.step(PHYSICS_DT, control);
    } else {
      car.step(control, PHYSICS_DT, this.track);
      if (this.mode === 'racing') this.race.update(car, PHYSICS_DT);
    }
    if (this.mode !== 'racing') return;

    for (const e of car.events) {
      if (e.type === 'boost') this.pendingBoost = e.tier;
      else if (e.type === 'driftEnd') { this.hud.driftEnded(e.score, this.pendingBoost ?? -1); this.pendingBoost = undefined; }
    }
    for (const e of this.race.events) {
      if (e.type === 'lap' && !this.race.finished) this.hud.toast(`LAP ${e.lap + 1}   ${fmtTime(e.lapTime)}`);
      else if (e.type === 'finish') {
        this.mode = 'finished';
        this.finishTimer = FINISH_DELAY;
        this.reported = false;
        this.bot.o.speedScale = 0.45;
        this.updateTouch();
        this.hud.hideHints();
        this.hud.toast(`FINISH   ${fmtTime(e.time)}`, 3);
      }
    }
  }

  effects(dt) {
    const car = this.car;
    if (this.mode === 'racing' || this.mode === 'finished') {
      this.hud.tick(dt);
      this.hud.setBig(fmtTime(this.race.time));
      this.hud.setLap(this.race.laps > 1 ? `LAP ${this.race.lapDisplay}/${this.race.laps}` : '');
      this.hud.setWrongWay(this.mode === 'racing' && this.race.wrongWay);
      this.hud.driftLive(this.mode === 'racing' && car.driftActive ? car.driftScore : 0);
      if (car.driftActive || car.drifting) this.hud.hideHints();
    } else {
      this.hud.tick(dt);
    }

    if (this.grid) {
      for (const e of this.grid.entries) this.emitCar(e.car, e.id, dt, e.isPlayer ? 1 : 0.6);
      this.standingsTimer -= dt;
      if (this.standingsTimer <= 0) { this.standingsTimer = 0.15; this.updateStandings(); }
    } else {
      this.emitCar(this.car, 0, dt, 1);
    }
  }

  // Tyre marks + smoke from the rear wheels while the tail is loose.
  emitCar(car, id, dt, rate) {
    const sliding = car.gripBlend > 0.3 && Math.abs(car.slip) > 0.12 && car.speed > 6;
    const w = { x: 0, z: 0 };
    for (let k = 0; k < 2; k++) {
      if (sliding && car.onRoad) {
        car.wheelPos(k ? 1 : -1, w);
        this.skids.add(this.time, id * 2 + k, w.x, w.z);
      } else {
        this.skids.add(this.time, id * 2 + k, null);
      }
    }
    if (sliding || (car.boosting && car.speed > 20)) {
      this.smokeAcc[id] = (this.smokeAcc[id] || 0) + dt * (sliding ? 60 : 24) * rate;
      while (this.smokeAcc[id] >= 1) {
        this.smokeAcc[id] -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        car.wheelPos(side, w);
        const sp = 1.2 + Math.random() * 1.6;
        const ang = Math.random() * 6.28;
        this.smoke.emit(this.time, w.x + (Math.random() - 0.5) * 0.4, w.z + (Math.random() - 0.5) * 0.4,
          car.vx * 0.25 + Math.cos(ang) * sp, car.vz * 0.25 + Math.sin(ang) * sp,
          0.7 + Math.random() * 0.7, 1.1 + Math.random() * 1.0);
      }
    }
  }

  updateStandings() {
    const g = this.grid;
    if (!g) return;
    this.hud.setStandings(g.standings.map((e) => ({ name: e.name, color: e.color, you: e.isPlayer })), g.player.position, g.entries.length);
  }

  draw(dt, inp) {
    const car = this.car;
    const steer = this.mode === 'racing' ? inp.steer : this.bot.out.steer;
    this.steerShown += (steer - this.steerShown) * Math.min(1, 14 * dt);
    this.model.update(car, this.steerShown);
    if (this.grid) for (const e of this.grid.entries) if (e.model) e.model.update(e.car, e.driver.out.steer);

    if (!this.paused) {
      this.rig.update(car, dt);
      this.world.followShadow(car.x, car.z);
      this.builder.updateChevrons(car.q.s ?? 0);
    }
    this.smoke.update(this.time);
    this.skids.update(this.time);
    if (this.mode !== 'demo') {
      const dots = this.grid
        ? this.grid.entries.map((e) => ({ x: e.car.x, z: e.car.z, big: e.isPlayer, color: e.isPlayer ? '#ff5a4a' : '#' + e.color.toString(16).padStart(6, '0') }))
        : [{ x: car.x, z: car.z, color: '#ff5a4a', big: true }];
      this.hud.minimap.draw(dots);
    }

    if (this.debug) {
      this.hud.debug(
        `fps ${this.fps.toFixed(0)}  device ${this.input.device}  mode ${this.mode}\n` +
        `speed ${car.speed.toFixed(1)}  slip ${(car.slip * 57.3).toFixed(0)}°  grip ${car.gripBlend.toFixed(2)}\n` +
        `steer ${inp.steer.toFixed(2)} brake ${inp.brake.toFixed(2)}  drift ${car.drifting ? 'Y' : '-'} ${car.driftTime.toFixed(1)}s\n` +
        `lat ${(car.q.lat ?? 0).toFixed(1)}  onRoad ${car.onRoad}  calls ${this.renderer.info.render.calls}`);
    }
    this.renderer.render(this.scene, this.rig.camera);
  }
}
