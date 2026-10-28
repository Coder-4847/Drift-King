// Game flow: menus <-> races. Owns the UI host and wires Game callbacks to screens + career rules.

import { UI } from './ui/UI.js';
import { audio } from './audio/Audio.js';
import { mainMenu, levelSelect, preRace, results, pauseMenu, gpSelect, gpPreRace, gpResults, settingsScreen, keysScreen, confirmReset, garageScreen } from './ui/screens.js';
import * as garage from './game/garage.js';
import { resetProgress } from './settings.js';
import * as career from './game/career.js';
import * as gp from './game/gp.js';
import { DIFFICULTIES } from './data/difficulty.js';
import { gpTracks } from './tracks/trackDefs.js';
import { saveGhost } from './game/ghost.js';

export class App {
  constructor({ game, input, overlayRoot }) {
    this.game = game;
    this.input = input;
    this.ui = new UI(overlayRoot);
    this.audio = audio;
    this.current = null;      // career level being raced (null = free drive / menus)
    this.lastChapter = 0;
    this.currentGp = null;    // { trackId, diff } while a Grand Prix race is on
    this.gpDiff = 0;

    game.onFinish = (r) => this.finished(r);
    input.onNav((a) => this.onNav(a));
  }

  // one place decides who gets nav events, so Esc/Start can never both open and close a menu
  onNav(a) {
    if (this.ui.isOpen) this.ui.nav(a);
    else if (a === 'pause') this.pause();
  }

  // ---------------------------------------------------------------- menus
  openMainMenu() {
    this.current = null; this.currentGp = null;
    this.game.loadTrack(this.game.trackId || 'c1l1');
    this.ui.open(mainMenu(this));
  }

  openLevelSelect(chapter = this.lastChapter, level = null) {
    this.current = null;
    if (this.game.mode !== 'demo') this.game.enterDemo(); // drops the race HUD
    this.ui.open(levelSelect(this, chapter, level));
  }

  openSettings() {
    this.current = null; this.currentGp = null;
    if (this.game.mode === 'garage') this.game.enterDemo();
    this.ui.open(settingsScreen(this));
    this.input.setTouchVisible(true); // preview of the touch buttons (dimmed behind the menu)
  }

  openKeys() { this.ui.open(keysScreen(this)); }
  openConfirmReset() { this.ui.open(confirmReset(this)); }

  resetProgress() {
    resetProgress();
    this.game.applyLoadout();
    audio.fail();
    this.openMainMenu();
  }

  openGarage() {
    this.current = null; this.currentGp = null;
    this.game.enterGarage();
    this.ui.open(garageScreen(this));
  }

  previewGarage(carId) {
    const car = garage.carById(carId);
    this.game.previewCar(car, garage.paintColor(garage.selectedPaint(), car));
  }

  // ---------------------------------------------------------------- Grand Prix
  openGpSelect(diff = this.gpDiff, focusTrack = null) {
    this.current = null; this.currentGp = null;
    if (this.game.mode !== 'demo') this.game.enterDemo();
    this.ui.open(gpSelect(this, diff, focusTrack));
  }

  openGpPreRace(trackId, diff) {
    this.game.loadTrack(trackId, { laps: 3 });
    this.ui.open(gpPreRace(this, trackId, diff));
  }

  startGpRace(trackId, diff) {
    this.current = null;
    this.currentGp = { trackId, diff };
    this.gpDiff = diff;
    this.game.loadTrack(trackId, { laps: 3 });
    this.ui.close();
    this.game.startRace({ difficulty: DIFFICULTIES[diff] });
  }

  openPreRace(id) {
    const lvl = career.levelById(id);
    this.game.loadTrack(lvl.track, { laps: lvl.laps }); // themed background while you read the targets
    this.ui.open(preRace(this, lvl));
  }

  // ---------------------------------------------------------------- racing
  startCareerRace(id) {
    const lvl = career.levelById(id);
    this.current = lvl;
    this.game.loadTrack(lvl.track, { laps: lvl.laps });
    this.ui.close();
    this.game.startRace(null, id);
  }

  /** Debug: race any track id without career tracking. */
  startFreeRace(trackId) {
    this.current = null;
    this.game.loadTrack(trackId);
    this.ui.close();
    this.game.startRace();
  }

  finished(r) {
    if (this.currentGp && r.standings) {
      const { trackId, diff } = this.currentGp;
      const rec = gp.recordGp(trackId, diff, r.standings);
      const list = gpTracks(), idx = list.findIndex((t) => t.id === trackId);
      this.game.hud.setVisible(false);
      this.ui.open(gpResults(this, { trackId, diff, standings: r.standings, rec, nextId: list[idx + 1]?.id || null }));
      return;
    }
    const lvl = this.current;
    if (!lvl) { this.game.hud.toast('Finished - open the pause menu to restart', 4); return; }
    const rec = career.recordResult(lvl, r.time, r.driftScore);
    if (rec.newBest && r.ghost) saveGhost(lvl.id, r.time, r.ghost);
    this.game.hud.setVisible(false);
    this.ui.open(results(this, { lvl, time: r.time, driftScore: r.driftScore, rec, next: career.nextLevel(lvl) }));
  }

  pause() {
    if (this.game.pause()) { audio.duck(true); this.ui.open(pauseMenu(this)); }
  }

  resume() {
    audio.duck(false);
    this.ui.close();
    this.game.resume();
  }

  restartRace() {
    audio.duck(false);
    this.ui.close();
    this.game.startRace(this.currentGp ? { difficulty: DIFFICULTIES[this.currentGp.diff] } : null, this.current ? this.current.id : null);
  }

  quitRace() {
    this.ui.close();
    const lvl = this.current;
    if (this.currentGp) { const g = this.currentGp; this.game.enterDemo(); this.openGpSelect(g.diff, g.trackId); return; }
    this.game.enterDemo();
    this.openLevelSelect(lvl ? lvl.chapter : this.lastChapter, lvl ? lvl.level : null);
  }
}
