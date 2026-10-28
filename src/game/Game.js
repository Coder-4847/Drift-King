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
import * as garageData from './garage.js';
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
import { audio } from '../audio/Audio.js';
import { GhostRecorder, loadGhost } from './ghost.js';

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

    // MSAA is wasted (and costly) on dense phone screens, where the pixel ratio already hides jaggies
    const dense = Math.min(devicePixelRatio || 1, this.quality.pixelRatio) >= 1.75;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !dense, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.hud = new Hud(hudRoot, input, { debug, onPause: () => onPauseButton?.() });

    this.dpr = Math.min(devicePixelRatio || 1, this.quality.pixelRatio); // lowered automatically if frames run slow
    this.perf = { t: 0, frames: 0 };
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
    this.ghost = null; this.ghostModel = null; this.recorder = null;
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
    audio.playMusic(def.chapter);
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

    const lo = garageData.loadout();
    this.car = new Car(lo.stats);
    this.model = new CarModel(lo.color, lo.accent);
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

  /** Career only: replay of your best run (translucent car) + a recorder for this run. */
  setupGhost(id) {
    if (this.ghostModel) { this.scene.remove(this.ghostModel.group); this.ghostModel = null; }
    this.ghost = id ? loadGhost(id) : null;
    this.recorder = id ? new GhostRecorder() : null;
    if (this.ghost) {
      const lo = garageData.loadout();
      this.ghostModel = new CarModel(0xbfdfff, 0xffffff); void lo;
      this.ghostModel.ghostify();
      this.scene.add(this.ghostModel.group);
      this.ghostModel.group.visible = false;
    }
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
    this.setupGhost(null);
    this.mode = 'demo';
    this.paused = false;
    this.bot.o.speedScale = 0.8;
    this.placeAtStart(this.debugStart ?? Math.random() * 0.9); // menu background starts somewhere on the lap
    this.hud.setVisible(false);
    this.hud.hideHints();
    this.updateTouch();
  }

  /** Use the car + paint currently chosen in the garage (stats apply immediately). */
  applyLoadout() {
    const lo = garageData.loadout();
    this.car.setStats(lo.stats);
    this.scene.remove(this.model.group);
    this.model = new CarModel(lo.color, lo.accent);
    this.scene.add(this.model.group);
  }

  /** Reset to the grid and run the 3-2-1 countdown, then the clock starts. */
  startRace(gp = null, ghostId = null) {
    this.setupGhost(ghostId);
    if (gp) this.setupGrid(gp.difficulty); else this.clearGrid();
    this.placeAtStart();
    this.mode = 'countdown';
    this.paused = false;
    this.countdown = COUNTDOWN;
    this.lastCountN = 0;
    audio.duck(false);
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

  /** Graphics quality changed in settings: rebuild the scene with the new preset. */
  applyQuality() {
    this.quality = QUALITY[settings.quality] || QUALITY.high;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.resize();
    if (this.trackId) {
      const id = this.trackId, laps = this.soloRace.laps;
      this.trackId = null;
      this.loadTrack(id, { laps });
    }
  }

  // ---------------------------------------------------------------- garage
  buildGarage() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x262922);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4a38, 1.3));
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(-6, 9, 5); scene.add(sun);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.4, 24), new THREE.MeshLambertMaterial({ color: 0x3a3d34, flatShading: true }));
    plat.position.y = -0.2; scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffcf3a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
    const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 60);
    this.garage = { scene, cam, model: null, spin: 0.6 };
  }

  /** Show a car on the turntable (garage screen). */
  previewCar(car, color) {
    if (!this.garage) this.buildGarage();
    const g = this.garage;
    if (g.model) g.scene.remove(g.model.group);
    g.model = new CarModel(color, car.accent);
    g.scene.add(g.model.group);
  }

  enterGarage() {
    this.clearGrid();
    this.mode = 'garage';
    this.paused = false;
    this.hud.setVisible(false);
    this.hud.hideHints();
    this.updateTouch();
    if (!this.garage) this.buildGarage();
    const lo = garageData.loadout();
    this.previewCar(lo.car, lo.color);
  }

  drawGarage(dt) {
    audio.engineUpdate({ active: false });
    const g = this.garage, cam = g.cam;
    const aspect = innerWidth / innerHeight;
    if (cam.aspect !== aspect) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
    if (g.model) g.model.group.rotation.y += dt * g.spin;
    // keep the car in the free part of the screen (panel sits at the bottom, or on the right in landscape)
    const land = aspect > 1.1;
    const dist = land ? 12 : Math.max(13, 13.2 / aspect);
    cam.position.set(dist * 0.62, dist * 0.42, dist * 0.7);
    if (land) cam.lookAt(2.4, 0.4, -2.1); else cam.lookAt(0, -1.6, 0);
    this.renderer.render(g.scene, cam);
  }

  pause() { if (!this.canPause()) return false; this.paused = true; this.hud.pauseHints(true); this.updateTouch(); return true; }
  resume() { this.paused = false; this.hud.pauseHints(false); this.last = performance.now(); this.updateTouch(); }

  // ---------------------------------------------------------------- loop
  resize() {
    const w = innerWidth, h = innerHeight;
    this.dpr = Math.min(this.dpr, devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(this.dpr);
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
    this.watchPerformance(dt);

    const inp = this.input.update(dt);
    if (this.mode === 'garage') { this.drawGarage(dt); return; }
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

  /** Dynamic resolution: if the last second averaged under ~48 fps while racing, drop the render scale a step. */
  watchPerformance(dt) {
    const p = this.perf;
    if (!this.racing || this.paused) { p.t = 0; p.frames = 0; return; }
    p.t += Math.min(dt, 0.25); p.frames++;
    if (p.t < 1.5) return;
    const fps = p.frames / p.t;
    p.t = 0; p.frames = 0;
    if (fps < 48 && this.dpr > 0.75) {
      this.dpr = Math.max(0.75, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(innerWidth, innerHeight, false);
    }
  }

  stepMode(dt) {
    if (this.mode === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - (COUNTDOWN - 3));
      if (this.countdown > COUNTDOWN - 3) {
        this.hud.countdown(String(n));
        if (n !== this.lastCountN) { this.lastCountN = n; audio.countdown(n); }
      } else if (this.countdown > 0) this.hud.countdown(null);
      if (this.countdown <= 0) {
        this.mode = 'racing';
        audio.go();
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
          ghost: this.recorder ? this.recorder.pack() : null,
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
      for (const b of this.grid.bumps) if (b.entry.isPlayer && b.strength > 0.1 && this.time - (this.lastBumpSfx || 0) > 0.15) { this.lastBumpSfx = this.time; audio.bump(); }
    } else {
      car.step(control, PHYSICS_DT, this.track);
      if (this.mode === 'racing') this.race.update(car, PHYSICS_DT);
    }
    if (this.mode !== 'racing') return;

    for (const e of car.events) {
      if (e.type === 'boost') { this.pendingBoost = e.tier; audio.boost(); }
      else if (e.type === 'wall') audio.thud(e.strength);
      else if (e.type === 'driftEnd') { this.hud.driftEnded(e.score, this.pendingBoost ?? -1); this.pendingBoost = undefined; }
    }
    for (const e of this.race.events) {
      if (e.type === 'lap' && !this.race.finished) { this.hud.toast(`LAP ${e.lap + 1}   ${fmtTime(e.lapTime)}`); audio.lap(); }
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
      if (this.mode === 'racing' && this.recorder) this.recorder.sample(this.race.time, car);
      this.hudAcc = (this.hudAcc || 0) + dt;
      if (this.hudAcc > 0.033) { this.hudAcc = 0; this.hud.setBig(fmtTime(this.race.time)); }
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
    const w = this._w || (this._w = { x: 0, z: 0 });
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
    if (this.ghostModel) {
      const live = this.mode === 'racing' || this.mode === 'countdown';
      this.ghostModel.group.visible = live;
      const st = live ? this.ghost.at(this.mode === 'racing' ? this.race.time : 0, this._gs || (this._gs = {})) : null;
      if (st) { this.ghostModel.group.position.set(st.x, 0, st.z); this.ghostModel.group.rotation.y = st.heading; }
    }

    if (!this.paused) {
      this.rig.update(car, dt);
      this.world.followShadow(car.x, car.z);
      this.builder.updateChevrons(car.q.s ?? 0);
    }
    audio.engineUpdate({
      active: (this.mode === 'racing' || this.mode === 'countdown') && !this.paused,
      speed: car.speed, maxSpeed: car.stats.maxSpeed, braking: this.mode === 'racing' && inp.brake > 0.05,
      slide: Math.min(1, car.gripBlend * Math.abs(car.slip) * 2.2), boosting: car.boosting,
    });
    this.smoke.update(this.time);
    this.skids.update(this.time);
    this.mapAcc = (this.mapAcc || 0) + dt;
    if (this.mode !== 'demo' && this.mapAcc > 0.033) {
      this.mapAcc = 0;
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
