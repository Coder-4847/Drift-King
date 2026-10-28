// Game flow: menus <-> races. Owns the UI host and wires Game callbacks to screens + career rules.

import { UI } from './ui/UI.js';
import { mainMenu, levelSelect, preRace, results, pauseMenu } from './ui/screens.js';
import * as career from './game/career.js';

export class App {
  constructor({ game, input, overlayRoot }) {
    this.game = game;
    this.input = input;
    this.ui = new UI(overlayRoot);
    this.current = null;      // career level being raced (null = free drive / menus)
    this.lastChapter = 0;

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
    this.current = null;
    this.game.loadTrack(this.game.trackId || 'c1l1');
    this.ui.open(mainMenu(this));
  }

  openLevelSelect(chapter = this.lastChapter, level = null) {
    this.current = null;
    if (this.game.mode !== 'demo') this.game.enterDemo(); // drops the race HUD
    this.ui.open(levelSelect(this, chapter, level));
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
    this.game.startRace();
  }

  /** Debug: race any track id without career tracking. */
  startFreeRace(trackId) {
    this.current = null;
    this.game.loadTrack(trackId);
    this.ui.close();
    this.game.startRace();
  }

  finished(r) {
    const lvl = this.current;
    if (!lvl) { this.game.hud.toast('Finished - open the pause menu to restart', 4); return; }
    const rec = career.recordResult(lvl, r.time, r.driftScore);
    this.game.hud.setVisible(false);
    this.ui.open(results(this, { lvl, time: r.time, driftScore: r.driftScore, rec, next: career.nextLevel(lvl) }));
  }

  pause() {
    if (this.game.pause()) this.ui.open(pauseMenu(this));
  }

  resume() {
    this.ui.close();
    this.game.resume();
  }

  restartRace() {
    this.ui.close();
    this.game.startRace();
  }

  quitRace() {
    this.ui.close();
    const lvl = this.current;
    this.game.enterDemo();
    this.openLevelSelect(lvl ? lvl.chapter : this.lastChapter, lvl ? lvl.level : null);
  }
}
