// Owns the renderer, the fixed-timestep loop and the current race (Phase 1: free driving
// on one test track). Later phases add game modes on top of this.

import * as THREE from 'three';
import { PHYSICS_DT, QUALITY } from '../config.js';
import { settings } from '../settings.js';
import { CARS } from '../data/cars.js';
import { Car } from './Car.js';
import { CarModel } from './CarModel.js';
import { CameraRig } from './CameraRig.js';
import { Smoke, SkidMarks } from './Particles.js';
import { World } from './World.js';
import { Track } from '../tracks/Track.js';
import { TrackBuilder } from '../tracks/TrackBuilder.js';
import { Hud } from '../ui/Hud.js';
import { Menu } from '../ui/Menu.js';

const fmtTime = (t) => t.toFixed(2);

export class Game {
  constructor({ canvas, hudRoot, overlayRoot, input, debug = false }) {
    this.canvas = canvas;
    this.input = input;
    this.debug = debug;
    this.quality = QUALITY[settings.quality] || QUALITY.high;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.rig = new CameraRig(innerWidth / innerHeight);

    this.hud = new Hud(hudRoot, input, { debug, onPause: () => this.togglePause() });
    this.menu = new Menu(overlayRoot, input);

    this.time = 0;       // simulation clock (stops while paused)
    this.raceTime = 0;
    this.acc = 0;
    this.paused = false;
    this.fps = 60;

    input.onNav((a) => { if (a === 'pause') this.togglePause(); }); // Esc / P / Start
    input.onDevice(() => input.setTouchVisible(!this.paused));
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 100));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    addEventListener('blur', () => this.pause());

    this.resize();
  }

  // ---------------------------------------------------------------- setup
  loadTrack(def) {
    // clear previous
    this.scene = new THREE.Scene();
    this.track = new Track(def);
    this.world = new World(this.scene, this.track, {}, settings.quality);
    this.builder = new TrackBuilder(this.track);
    this.scene.add(this.builder.group);

    this.smoke = new Smoke(this.quality.smoke);
    this.skids = new SkidMarks(this.quality.skids);
    this.scene.add(this.skids.mesh, this.smoke.mesh);

    const def0 = CARS[0];
    this.car = new Car(def0.stats);
    this.model = new CarModel(def0.color, def0.accent);
    this.scene.add(this.model.group);

    this.hud.setTitle(this.track.name);
    this.restart();
  }

  restart() {
    const t = this.track;
    const i = t.wrap(-3); // a few metres behind the line
    this.car.reset(t.x[i], t.z[i], t.headingAt(i), 0);
    this.car.q = {};
    this.skids.clear();
    this.smoke.clear();
    this.time = 0;
    this.raceTime = 0;
    this.acc = 0;
    this.smokeAcc = 0;
    this.steerShown = 0;
    this.rig.snap(this.car);
    this.world.followShadow(this.car.x, this.car.z);
    this.hud.setBig(fmtTime(0));
    this.hud.hideHints();
    this.hud.showHints();
    this.resume();
  }

  // ---------------------------------------------------------------- pause
  pause() {
    if (this.paused || !this.track) return;
    this.paused = true;
    this.input.setTouchVisible(false);
    this.menu.show({
      title: 'Paused',
      items: [
        { label: 'Resume', action: () => this.resume() },
        { label: 'Restart', action: () => this.restart() },
      ],
      onBack: () => this.resume(),
    });
  }

  resume() {
    this.paused = false;
    this.menu.hide();
    this.input.setTouchVisible(true);
    this.last = performance.now();
  }

  togglePause() { this.paused ? this.resume() : this.pause(); }

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
      this.acc += dt;
      while (this.acc >= PHYSICS_DT) {
        this.acc -= PHYSICS_DT;
        this.simStep(inp);
      }
      this.raceTime += dt;
      this.time += dt;
      this.effects(dt, inp);
    }
    this.draw(dt, inp);
  }

  simStep(inp) {
    const car = this.car;
    car.step(inp, PHYSICS_DT, this.track);
    for (const e of car.events) {
      if (e.type === 'boost') this.pendingBoost = e.tier;
      else if (e.type === 'driftEnd') this.hud.driftEnded(e.score, this.pendingBoost ?? -1), (this.pendingBoost = undefined);
    }
  }

  effects(dt, inp) {
    const car = this.car;
    this.hud.tick(dt);
    this.hud.setBig(fmtTime(this.raceTime));
    this.hud.driftLive(car.driftActive ? car.driftScore : 0);
    if (car.driftActive || car.drifting) this.hud.hideHints();

    // Tyre marks + smoke from the rear wheels while the tail is loose.
    const sliding = car.gripBlend > 0.3 && Math.abs(car.slip) > 0.12 && car.speed > 6;
    const w = { x: 0, z: 0 };
    for (let k = 0; k < 2; k++) {
      if (sliding && car.onRoad) {
        car.wheelPos(k ? 1 : -1, w);
        this.skids.add(this.time, k, w.x, w.z);
      } else {
        this.skids.add(this.time, k, null);
      }
    }
    if (sliding || (car.boosting && car.speed > 20)) {
      this.smokeAcc += dt * (sliding ? 60 : 24);
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
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

  draw(dt, inp) {
    const car = this.car;
    // smooth the steering shown on the wheels
    this.steerShown += (inp.steer - this.steerShown) * Math.min(1, 14 * dt);
    this.model.update(car, this.steerShown);

    if (!this.paused) {
      this.rig.update(car, dt);
      this.world.followShadow(car.x, car.z);
      this.builder.updateChevrons(car.q.s ?? 0);
    }
    this.smoke.update(this.time);
    this.skids.update(this.time);

    if (this.debug) {
      this.hud.debug(
        `fps ${this.fps.toFixed(0)}  device ${this.input.device}\n` +
        `speed ${car.speed.toFixed(1)}  slip ${(car.slip * 57.3).toFixed(0)}°  grip ${car.gripBlend.toFixed(2)}\n` +
        `steer ${inp.steer.toFixed(2)} brake ${inp.brake.toFixed(2)}  drift ${car.drifting ? 'Y' : '-'} ${car.driftTime.toFixed(1)}s\n` +
        `lat ${(car.q.lat ?? 0).toFixed(1)}  onRoad ${car.onRoad}  calls ${this.renderer.info.render.calls}`);
    }
    this.renderer.render(this.scene, this.rig.camera);
  }
}
