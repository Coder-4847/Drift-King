// Minimal HUD: level title, big number (timer), drift pop-up, first-race control hints,
// pause button. Plain DOM; updates only touch text that changed.

import { progress, save } from '../settings.js';
import { Minimap } from './Minimap.js';

export class Hud {
  constructor(root, input, { debug = false, onPause } = {}) {
    this.input = input;
    root.innerHTML = `
      <div class="hud-top"><div class="hud-title"></div><div class="hud-big">0.00</div><div class="hud-lap"></div></div>
      <div class="wrongway">WRONG WAY</div>
      <div class="toast"></div>
      <div class="drift-pop"><span></span><small></small></div>
      <div class="hint"></div>
      <button class="hud-pause" type="button" aria-label="Pause"><i></i></button>
      ${debug ? '<div class="debug"></div>' : ''}`;
    this.title = root.querySelector('.hud-title');
    this.big = root.querySelector('.hud-big');
    this.pop = root.querySelector('.drift-pop');
    this.popMain = this.pop.querySelector('span');
    this.popSub = this.pop.querySelector('small');
    this.hint = root.querySelector('.hint');
    this.debugEl = root.querySelector('.debug');
    root.querySelector('.hud-pause').addEventListener('click', () => onPause?.());
    root.querySelector('.hud-pause').addEventListener('mousedown', (e) => e.preventDefault());
    this.lap = root.querySelector('.hud-lap');
    this.wrong = root.querySelector('.wrongway');
    this.toastEl = root.querySelector('.toast');
    this.minimap = new Minimap(root);
    this.toastTimer = 0;
    this.cache = {};
    this.popTimer = 0;
    this.hintTimer = 0;
  }

  setTitle(t) { this.title.textContent = t; }

  setLap(text) {
    if (this.cache.lap !== text) { this.cache.lap = text; this.lap.textContent = text; }
  }

  setWrongWay(on) {
    if (this.cache.wrong !== on) { this.cache.wrong = on; this.wrong.classList.toggle('on', on); }
  }

  toast(text, seconds = 1.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastTimer = seconds;
  }

  setBig(text) {
    if (this.cache.big !== text) { this.cache.big = text; this.big.textContent = text; }
  }

  // current drift in progress (score) or recent result
  driftLive(score) {
    if (this.popTimer > 0) return;
    if (score > 15) this.showPop(`DRIFT ${Math.round(score)}`, '', false, true);
    else if (this.pop.classList.contains('on') && this.sticky) this.pop.classList.remove('on');
  }

  showPop(main, sub = '', boost = false, sticky = false, seconds = 0) {
    this.sticky = sticky;
    this.popMain.textContent = main;
    this.popSub.textContent = sub;
    this.pop.classList.toggle('boost', boost);
    this.pop.classList.add('on');
    this.popTimer = seconds;
  }

  driftEnded(score, boostTier) {
    const main = `+${Math.round(score)}`;
    const sub = boostTier === 1 ? 'SUPER BOOST' : boostTier === 0 ? 'BOOST' : '';
    this.showPop(main, sub, boostTier >= 0, false, 1.1);
  }

  tick(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('on');
    }
    if (this.popTimer > 0) {
      this.popTimer -= dt;
      if (this.popTimer <= 0) this.pop.classList.remove('on');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) { this.hint.classList.remove('on'); progress.hintsSeen = true; save(); }
    }
  }

  // Control hints, first race only; text follows the device currently in use.
  showHints() {
    if (progress.hintsSeen) return;
    const dev = this.input.device;
    const lines = {
      touch: 'The car speeds up by itself.<br>Use <b>◀ ▶</b> to steer. Hold the <b>BRAKE</b> while turning to drift.',
      keyboard: 'The car speeds up by itself.<br><b>A / D</b> or <b>← →</b> to steer. Hold <b>Space</b> while turning to drift.',
      gamepad: 'The car speeds up by itself.<br><b>Left stick</b> to steer. Hold <b>A / RT</b> while turning to drift.',
    };
    this.hint.innerHTML = lines[dev] || lines.keyboard;
    this.hint.classList.add('on');
    this.hintTimer = 9;
  }

  hideHints() { this.hint.classList.remove('on'); this.hintTimer = 0; }

  debug(text) { if (this.debugEl) this.debugEl.textContent = text; }
}
