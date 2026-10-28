// Minimal HUD: level title, big number (timer), drift pop-up, first-race control hints,
// pause button. Plain DOM; updates only touch text that changed.

import { progress, save, settings } from '../settings.js';
import { keyName } from '../util/format.js';
import { Minimap } from './Minimap.js';

export class Hud {
  constructor(root, input, { debug = false, onPause } = {}) {
    this.input = input;
    root.innerHTML = `
      <div class="hud-top"><div class="hud-title"></div><div class="hud-big">0.00</div><div class="hud-lap"></div></div>
      <div class="wrongway">WRONG WAY</div>
      <div class="toast"></div>
      <div class="countdown"></div>
      <div class="danger"></div>
      <div class="crashfx"></div>
      <div class="gp-pos"></div>
      <div class="gp-list"></div>
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
    this.root = root;
    this.cd = root.querySelector('.countdown');
    this.dangerEl = root.querySelector('.danger');
    this.crashEl = root.querySelector('.crashfx');
    this.posEl = root.querySelector('.gp-pos');
    this.listEl = root.querySelector('.gp-list');
    this.lap = root.querySelector('.hud-lap');
    this.wrong = root.querySelector('.wrongway');
    this.toastEl = root.querySelector('.toast');
    this.minimap = new Minimap(root);
    this.toastTimer = 0;
    this.cache = {};
    input.onDevice(() => { if (this.hintTimer > 0) this.renderHint(); });
    this.popTimer = 0;
    this.hintTimer = 0;
  }

  setTitle(t) { this.title.textContent = t; }

  /** Grand Prix extras (position + standings) on or off. */
  setGp(on) {
    this.posEl.style.display = on ? '' : 'none';
    this.listEl.style.display = on ? '' : 'none';
    this.cache.pos = null; this.cache.list = null;
  }

  /** rows: [{ name, color (hex or null), you }] in race order. */
  setStandings(rows, position, total) {
    const sfx = ['th', 'st', 'nd', 'rd'][position % 100 > 10 && position % 100 < 14 ? 0 : position % 10 < 4 ? position % 10 : 0];
    const posHtml = `${position}<sup>${sfx}</sup><small>/${total}</small>`;
    if (this.cache.pos !== posHtml) { this.cache.pos = posHtml; this.posEl.innerHTML = posHtml; }
    const key = rows.map((r) => r.name).join();
    if (this.cache.list !== key) {
      this.cache.list = key;
      this.listEl.innerHTML = rows.map((r, i) =>
        `<div class="${r.you ? 'you' : ''}"><b>${i + 1}</b><i style="background:${r.color == null ? '#ff5a4a' : '#' + r.color.toString(16).padStart(6, '0')}"></i>${r.name}</div>`).join('');
    }
  }

  /** 0..1: red glow at the screen edges (near the road edge / about to spin). */
  setDanger(v) {
    const q = Math.round(v * 20) / 20;
    if (this.cache.danger !== q) { this.cache.danger = q; this.dangerEl.style.opacity = q; }
  }

  /** Crash replay: flash, then everything but the effects fades away. */
  crashed(on) {
    this.root.classList.toggle('crashed', on);
    this.crashEl.classList.remove('flash');
    if (on) { void this.crashEl.offsetWidth; this.crashEl.classList.add('flash'); }
  }

  setVisible(v) { this.root.style.display = v ? '' : 'none'; }

  /** Big 3 / 2 / 1 / GO! in the middle of the screen; null hides it. */
  countdown(text, seconds = 0) {
    if (text === null) { if (this.cdText !== null) { this.cd.classList.remove('on'); this.cdText = null; } this.cdTimer = 0; return; }
    if (text !== this.cdText) {
      this.cdText = text;
      this.cd.textContent = text;
      this.cd.classList.remove('on'); void this.cd.offsetWidth; this.cd.classList.add('on'); // restart the pop animation
    }
    this.cdTimer = seconds;
  }

  driftReset() { this.popTimer = 0; this.sticky = false; this.pop.classList.remove('on'); this.toastTimer = 0.0001; }

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
    if (this.cdTimer > 0) {
      this.cdTimer -= dt;
      if (this.cdTimer <= 0) { this.cd.classList.remove('on'); this.cdText = null; }
    }
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
    this.hintTimer = 12;
    this.renderHint();
    this.hint.classList.add('on');
  }

  renderHint() {
    const dev = this.input.device;
    const lines = {
      touch: 'Steer hard to <b>drift</b>, then counter-steer to hold it.<br><b>BRAKE</b> only to slow for a tight corner or save a spin. <b>Leave the road and you lose.</b>',
      keyboard: `Steer hard to <b>drift</b> (<b>${keyName(settings.keys.left[0])} / ${keyName(settings.keys.right[0])}</b>), then counter-steer to hold it.<br><b>${keyName(settings.keys.brake[0])}</b> only to slow for a tight corner or save a spin. <b>Leave the road and you lose.</b>`,
      gamepad: 'Steer hard with the <b>left stick</b> to drift, then counter-steer to hold it.<br><b>A / RT</b> only to slow for a tight corner or save a spin. <b>Leave the road and you lose.</b>',
    };
    this.hint.innerHTML = lines[dev] || lines.keyboard;
  }

  /** Hide the control hint while the pause menu is open (its timer is frozen too). */
  pauseHints(paused) { this.hint.classList.toggle('on', !paused && this.hintTimer > 0); }

  hideHints() { this.hint.classList.remove('on'); this.hintTimer = 0; }

  debug(text) { if (this.debugEl) this.debugEl.textContent = text; }
}
