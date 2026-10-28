// Menu screens. Each function returns a screen object for UI.open().

import { el, button } from './UI.js';
import { audio } from '../audio/Audio.js';
import { CHAPTERS } from '../data/chapters.js';
import { fmtTime, fmtScore, keyName } from '../util/format.js';
import * as career from '../game/career.js';
import * as gp from '../game/gp.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { REWARD_COLORS } from '../data/cars.js';
import { specOf, gpTracks, getTrackDef } from '../tracks/trackDefs.js';
import { Track } from '../tracks/Track.js';
import * as garage from '../game/garage.js';
import { CARS } from '../data/cars.js';
import { settings, save } from '../settings.js';
import { drawTrackPath } from './Minimap.js';

const LOCK = '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';

const starsHtml = (n, total = 3) =>
  Array.from({ length: total }, (_, i) => `<span class="st${i < n ? ' on' : ''}">★</span>`).join('');

function note(root) {
  const n = el('div', 'note');
  root.appendChild(n);
  let t;
  return (text) => { n.textContent = text; n.classList.add('on'); clearTimeout(t); t = setTimeout(() => n.classList.remove('on'), 2000); };
}

// ------------------------------------------------------------------ main menu
export function mainMenu(app) {
  const root = el('div', 'scr scr-main');
  root.innerHTML = `<div class="logo"><span>DRIFT</span><span>KINGS</span></div>`;
  const list = el('div', 'stack');
  const career_ = button('Career', () => app.openLevelSelect(), 'primary');
  list.append(career_, button('Grand Prix', () => app.openGpSelect()), button('Garage', () => app.openGarage()), button('Settings', () => app.openSettings()));
  root.appendChild(list);
  const stars = el('div', 'total', `<span class="st on">★</span> ${career.totalStars()} / ${career.maxStars()}`);
  root.appendChild(stars);
  const p = app.input.prompts();
  if (app.input.device !== 'touch') root.appendChild(el('div', 'prompt', `${p.confirm} select  ·  arrows / D-pad move`));
  return { el: root, autofocus: career_ };
}

// ------------------------------------------------------------------ level select
export function levelSelect(app, chapter = 0, focusLevel = null) {
  const root = el('div', 'scr scr-levels');
  const header = el('div', 'bar-top');
  const back = button('<span class="chev">‹</span>', () => app.openMainMenu(), 'icon back');
  back.setAttribute('aria-label', 'Back');
  header.append(back, el('h2', '', 'Career'), el('div', 'total', `<span class="st on">★</span> ${career.totalStars()}<small> / ${career.maxStars()}</small>`));
  root.appendChild(header);

  const tabs = el('div', 'tabs');
  const tabBtns = CHAPTERS.map((c, i) => {
    const locked = !career.chapterUnlocked(i);
    const b = button(`${i + 1}${locked ? LOCK : ''}`, () => select(i), `tab${locked ? ' locked' : ''}`);
    b.dataset.tab = i;
    tabs.appendChild(b);
    return b;
  });
  root.appendChild(tabs);

  const panel = el('div', 'panel');
  root.appendChild(panel);
  const say = note(root);
  let current = -1;

  function select(i, focusLvl = null) {
    current = i;
    app.lastChapter = i;
    tabBtns.forEach((b, k) => b.classList.toggle('sel', k === i));
    const ch = CHAPTERS[i];
    const unlocked = career.chapterUnlocked(i);
    panel.innerHTML = '';
    panel.appendChild(el('div', 'ch-head',
      `<h3>${i + 1}. ${ch.name}</h3><p>${ch.blurb}</p><div class="ch-stars"><span class="st on">★</span> ${career.chapterStars(i)} / 30</div>`));
    if (!unlocked) {
      const need = career.starsNeeded(i), have = Math.min(career.totalStars(), need);
      panel.appendChild(el('div', 'unlock',
        `<div class="bar"><i style="width:${(have / need) * 100}%"></i></div><p>${LOCK} ${have} / ${need} stars to unlock Chapter ${i + 1}</p>`));
    }
    const grid = el('div', 'grid');
    let focusEl = null;
    career.levelsOf(i).forEach((lvl) => {
      const ok = career.levelUnlocked(i, lvl.level);
      const stars = career.starsFor(lvl.id);
      const t = button(
        `<span class="num">${lvl.level + 1}</span>` +
        (ok ? `<span class="stars">${starsHtml(stars)}</span>` : `<span class="stars">${LOCK}</span>`) +
        `<span class="nm">${specOf(lvl.track).name}</span>`,
        () => app.openPreRace(lvl.id), `tile${ok ? '' : ' locked disabled'}${stars === 3 ? ' gold' : ''}`);
      t.addEventListener('denied', () => say(unlocked ? `Finish level ${lvl.level} to unlock this one` : `Collect ${career.starsNeeded(i)} stars to unlock this chapter`));
      grid.appendChild(t);
      if (focusLvl === lvl.level) focusEl = t;
    });
    panel.appendChild(grid);
    // first unlocked-but-unfinished level is a good default target
    return focusEl;
  }

  const screen = {
    el: root,
    onBack: () => app.openMainMenu(),
    onFocus: (e) => { if (e.dataset.tab !== undefined && +e.dataset.tab !== current) select(+e.dataset.tab); },
  };
  // choose the level to focus: requested, or the first one not yet 3-starred and unlocked
  let target = focusLevel;
  if (target === null) {
    const lv = career.levelsOf(chapter).find((l) => career.levelUnlocked(chapter, l.level) && career.starsFor(l.id) < 3);
    target = lv ? lv.level : 0;
  }
  const focusEl = select(chapter, target);
  screen.autofocus = focusEl || tabBtns[chapter];
  return screen;
}

// ------------------------------------------------------------------ pre-race
export function preRace(app, lvl) {
  const spec = specOf(lvl.track);
  const ch = CHAPTERS[lvl.chapter];
  const best = career.bestTime(lvl.id), stars = career.starsFor(lvl.id);
  const root = el('div', 'scr scr-pre');
  root.innerHTML = `
    <div class="card">
      <div class="kicker">${ch.name} · Level ${lvl.level + 1}</div>
      <h2>${spec.name}</h2>
      <div class="meta">${lvl.laps} lap${lvl.laps > 1 ? 's' : ''} · ${spec.length} m</div>
      <div class="targets">
        <div class="${stars >= 3 ? 'got' : ''}"><span class="stars">${starsHtml(3)}</span><b>${fmtTime(lvl.gold)}</b></div>
        <div class="${stars >= 2 ? 'got' : ''}"><span class="stars">${starsHtml(2)}</span><b>${fmtTime(lvl.silver)}</b></div>
        <div class="${stars >= 1 ? 'got' : ''}"><span class="stars">${starsHtml(1)}</span><b>${fmtTime(lvl.bronze)}</b></div>
      </div>
      <div class="best">${best !== undefined ? `Best <b>${fmtTime(best)}</b>` : 'No time yet'}</div>
    </div>`;
  const actions = el('div', 'stack');
  const start = button('Start', () => app.startCareerRace(lvl.id), 'primary');
  const back = button('Back', () => app.openLevelSelect(lvl.chapter, lvl.level));
  actions.append(start, back);
  root.appendChild(actions);
  return { el: root, autofocus: start, onBack: () => app.openLevelSelect(lvl.chapter, lvl.level) };
}

// ------------------------------------------------------------------ results
export function results(app, r) {
  const { lvl, time, driftScore, rec, next } = r;
  const spec = specOf(lvl.track);
  const root = el('div', 'scr scr-result');
  const failed = rec.stars === 0;
  const stars = [1, 2, 3].map((i) => `<span class="big st${i <= rec.stars ? ' on pop' : ''}" style="animation-delay:${0.35 + i * 0.4}s">★</span>`).join('');
  root.innerHTML = `
    <div class="card">
      <div class="kicker">${spec.name}</div>
      <h2>${failed ? 'Too slow' : 'Finished'}</h2>
      <div class="time">${fmtTime(time)}</div>
      <div class="sub">${rec.newBest ? '<b class="newbest">NEW BEST</b>' : `Best <b>${fmtTime(rec.prevBest ?? time)}</b>`}</div>
      <div class="starrow">${stars}</div>
      <div class="sub">${failed ? `1 star needs ${fmtTime(lvl.bronze)}` : rec.newStars ? `+${rec.newStars} new star${rec.newStars > 1 ? 's' : ''}` : ''}</div>
      <div class="drift">Drift score <b>${fmtScore(driftScore)}</b></div>
      ${rec.unlockedChapters.length ? `<div class="unlocked">Chapter ${rec.unlockedChapters[0] + 1} unlocked: ${CHAPTERS[rec.unlockedChapters[0]].name}</div>` : ''}
      ${(rec.unlockedCars || []).length ? `<div class="unlocked">New car: ${rec.unlockedCars.map((c) => c.name).join(', ')}</div>` : ''}
    </div>`;
  const actions = el('div', 'row');
  const retry = button('Retry', () => app.startCareerRace(lvl.id));
  const nextB = button('Next', () => app.openPreRace(next.id), 'primary');
  if (!next) nextB.classList.add('disabled');
  const menu = button('Menu', () => app.openLevelSelect(lvl.chapter, lvl.level));
  actions.append(retry, nextB, menu);
  root.appendChild(actions);
  // sounds in time with the star animation (CSS delays 0.75 / 1.15 / 1.55 s)
  const later = (ms, fn) => setTimeout(() => { if (root.isConnected) fn(); }, ms);
  if (failed) later(300, () => audio.fail());
  else for (let i = 0; i < rec.stars; i++) later(750 + i * 400, () => audio.star(i));
  if (rec.newBest && !failed) later(250, () => audio.fanfare());
  return { el: root, autofocus: next ? nextB : retry, onBack: () => app.openLevelSelect(lvl.chapter, lvl.level) };
}

// ------------------------------------------------------------------ pause
export function pauseMenu(app) {
  const root = el('div', 'scr scr-pause');
  root.appendChild(el('h2', '', 'Paused'));
  const list = el('div', 'stack');
  const resume = button('Resume', () => app.resume(), 'primary');
  list.append(resume, button('Restart', () => app.restartRace()), button('Quit', () => app.quitRace()));
  root.appendChild(list);
  const p = app.input.prompts();
  if (app.input.device !== 'touch') root.appendChild(el('div', 'prompt', `${p.confirm} select  ·  ${p.back} resume`));
  return { el: root, autofocus: resume, onBack: () => app.resume() };
}

// ------------------------------------------------------------------ Grand Prix
const thumbs = new Map();
function thumb(trackId, size = 84) {
  if (!thumbs.has(trackId)) {
    const c = document.createElement('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = c.height = size * dpr;
    c.style.width = c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrackPath(ctx, new Track(getTrackDef(trackId)), size, { lineWidth: 3.5, pad: 6 });
    thumbs.set(trackId, c);
  }
  const c = thumbs.get(trackId).cloneNode();
  c.getContext('2d').drawImage(thumbs.get(trackId), 0, 0);
  return c;
}

const DIFF_BLURB = [
  'Very easy. Slow rivals that make mistakes and get in your way less.',
  'Easy. A bit quicker, still makes the odd mistake.',
  'Balanced. Competitive with a decent player.',
  'Hard. Fast, rarely slips up, drifts the corners.',
  'Very hard. Near-perfect line and full speed. Beatable only with a clean run.',
];

export function gpSelect(app, diff = app.gpDiff ?? 0, focusTrack = null) {
  const root = el('div', 'scr scr-levels scr-gp');
  const header = el('div', 'bar-top');
  const back = button('<span class="chev">‹</span>', () => app.openMainMenu(), 'icon back');
  header.append(back, el('h2', '', 'Grand Prix'), el('div', 'total', ''));
  root.appendChild(header);

  const tabs = el('div', 'tabs diffs');
  const chips = DIFFICULTIES.map((d, i) => {
    const wins = gp.winsOn(i);
    const b = button(`${d.name}${gp.rewardUnlocked(i) ? ' <span class="st on">★</span>' : ''}`, () => select(i), 'tab');
    b.dataset.tab = i;
    tabs.appendChild(b);
    return b;
  });
  root.appendChild(tabs);
  const panel = el('div', 'panel');
  root.appendChild(panel);
  let current = -1;

  function select(i, focusId = null) {
    current = i;
    app.gpDiff = i;
    chips.forEach((b, k) => b.classList.toggle('sel', k === i));
    const d = DIFFICULTIES[i], rw = REWARD_COLORS[i];
    panel.innerHTML = '';
    panel.appendChild(el('div', 'ch-head',
      `<p>${DIFF_BLURB[i]}</p><div class="ch-stars"><span class="swatch" style="background:#${rw.color.toString(16).padStart(6, '0')}"></span>` +
      `${rw.name} ${gp.rewardUnlocked(i) ? '(unlocked)' : '- win any race to unlock'} · ${gp.winsOn(i)} / 10 won</div>`));
    const grid = el('div', 'grid gp-grid');
    let focusEl = null;
    gpTracks().forEach((t) => {
      const best = gp.bestFinish(t.id, i);
      const tile = button('', () => app.openGpPreRace(t.id, i), `tile gp${best && best.pos === 1 ? ' gold' : ''}`);
      tile.appendChild(thumb(t.id));
      tile.appendChild(el('span', 'nm', t.name));
      tile.appendChild(el('span', 'badge', best ? gp.ordinal(best.pos) : '-'));
      grid.appendChild(tile);
      if (focusId === t.id) focusEl = tile;
    });
    panel.appendChild(grid);
    return focusEl;
  }
  const focusEl = select(diff, focusTrack);
  return {
    el: root, autofocus: focusEl || chips[diff],
    onBack: () => app.openMainMenu(),
    onFocus: (e) => { if (e.dataset.tab !== undefined && +e.dataset.tab !== current) select(+e.dataset.tab); },
  };
}

export function gpPreRace(app, trackId, diff) {
  const spec = specOf(trackId), d = DIFFICULTIES[diff];
  const best = gp.bestFinish(trackId, diff);
  const root = el('div', 'scr scr-pre');
  const card = el('div', 'card');
  card.innerHTML = `<div class="kicker">Grand Prix · ${d.name}</div><h2>${spec.name}</h2>` +
    `<div class="meta">3 laps · 6 cars · ${spec.length} m</div>`;
  card.appendChild(thumb(trackId, 120));
  card.appendChild(el('div', 'best', best ? `Best finish <b>${gp.ordinal(best.pos)}</b> · ${best.points} pts` : 'Not raced yet'));
  card.appendChild(el('div', 'meta', 'Points 25 · 18 · 15 · 12 · 10 · 8'));
  root.appendChild(card);
  const actions = el('div', 'stack');
  const start = button('Start', () => app.startGpRace(trackId, diff), 'primary');
  actions.append(start, button('Back', () => app.openGpSelect(diff, trackId)));
  root.appendChild(actions);
  return { el: root, autofocus: start, onBack: () => app.openGpSelect(diff, trackId) };
}

export function gpResults(app, r) {
  const { trackId, diff, standings, rec, nextId } = r;
  const spec = specOf(trackId);
  const root = el('div', 'scr scr-result scr-gpres');
  const winner = standings[0].time;
  const rows = standings.map((s, i) => {
    const col = s.entry.color == null ? '#ff5a4a' : '#' + s.entry.color.toString(16).padStart(6, '0');
    return `<div class="${s.entry.isPlayer ? 'you' : ''}"><b>${s.position}</b><i style="background:${col}"></i><span>${s.entry.name}</span>` +
      `<em>${i === 0 ? fmtTime(s.time) : `${s.estimated ? '~' : ''}+${(s.time - winner).toFixed(1)}`}</em><u>${s.points}</u></div>`;
  }).join('');
  root.innerHTML = `
    <div class="card">
      <div class="kicker">${spec.name} · ${DIFFICULTIES[diff].name}</div>
      <h2>${rec.pos === 1 ? 'Victory!' : `${gp.ordinal(rec.pos)} place`}</h2>
      <div class="sub">+${rec.points} points${rec.newBest ? ' · <b class="newbest">NEW BEST</b>' : ''}</div>
      <div class="table">${rows}</div>
      ${rec.reward ? `<div class="unlocked">Paint unlocked: ${rec.reward.name}</div>` : ''}
    </div>`;
  const actions = el('div', 'row');
  const retry = button('Retry', () => app.startGpRace(trackId, diff));
  const next = button('Next', () => app.openGpPreRace(nextId, diff), 'primary');
  if (!nextId) next.classList.add('disabled');
  actions.append(retry, next, button('Menu', () => app.openGpSelect(diff, trackId)));
  root.appendChild(actions);
  setTimeout(() => { if (root.isConnected) (rec.pos === 1 ? audio.fanfare() : audio.lap()); }, 300);
  return { el: root, autofocus: nextId ? next : retry, onBack: () => app.openGpSelect(diff, trackId) };
}

// ------------------------------------------------------------------ settings
const pct = (v) => `${Math.round(v * 100)}%`;
/** A settings row: label + current value; left / right (or tapping the arrows) change it. */
function settingRow(label, getText, change) {
  const b = button(`<span class="lbl">${label}</span><span class="val"><i>◀</i><b></b><i>▶</i></span>`, (_, e) => {
    const r = b.getBoundingClientRect();
    const x = e && e.clientX ? (e.clientX - r.left) / r.width : 0.5; // keyboard confirm has no position
    change(x < 0.5 ? -1 : 1);
  }, 'setrow');
  const val = b.querySelector('b');
  const refresh = () => { val.textContent = getText(); };
  b.adjust = (dir) => { change(dir); };
  b.refresh = refresh;
  refresh();
  return b;
}

export function settingsScreen(app) {
  const root = el('div', 'scr scr-settings');
  const header = el('div', 'bar-top');
  const back = button('<span class="chev">‹</span>', () => app.openMainMenu(), 'icon back');
  header.append(back, el('h2', '', 'Settings'), el('div'));
  root.appendChild(header);
  const panel = el('div', 'panel list');
  root.appendChild(panel);
  const rows = [];
  const step = (key, min, max, inc, after) => (dir) => {
    const v = Math.round((settings[key] + dir * inc) * 100) / 100;
    settings[key] = Math.max(min, Math.min(max, v));
    save(); after?.(); rows.forEach((r) => r.refresh());
  };
  const cycle = (key, options, after) => (dir) => {
    const i = options.indexOf(settings[key]);
    settings[key] = options[(i + dir + options.length) % options.length];
    save(); after?.(); rows.forEach((r) => r.refresh());
  };
  const add = (label, get, change) => { const r = settingRow(label, get, change); rows.push(r); panel.appendChild(r); return r; };
  const touchRefresh = () => app.input.touch.refresh();

  panel.appendChild(el('h4', '', 'Sound'));
  add('Sound volume', () => pct(settings.sfxVolume), step('sfxVolume', 0, 1, 0.1, () => { app.audio.applySettings(); app.audio.click(); }));
  add('Music volume', () => pct(settings.musicVolume), step('musicVolume', 0, 1, 0.1, () => app.audio.applySettings()));
  panel.appendChild(el('h4', '', 'Touch controls'));
  add('Layout', () => (settings.touchLayout === 'corners' ? 'Corner buttons' : 'Screen halves'), cycle('touchLayout', ['corners', 'halves'], touchRefresh));
  add('Button size', () => pct(settings.buttonSize), step('buttonSize', 0.7, 1.4, 0.1, touchRefresh));
  add('Button opacity', () => pct(settings.buttonOpacity), step('buttonOpacity', 0.2, 1, 0.1, touchRefresh));
  add('Vibration', () => (settings.vibration ? 'On' : 'Off'), (d) => { settings.vibration = !settings.vibration; save(); rows.forEach((r) => r.refresh()); if (settings.vibration) navigator.vibrate?.(20); });
  panel.appendChild(el('h4', '', 'Controller'));
  add('Stick deadzone', () => pct(settings.deadzone), step('deadzone', 0, 0.4, 0.02));
  add('Steering sensitivity', () => `${settings.sensitivity.toFixed(1)}x`, step('sensitivity', 0.5, 2, 0.1));
  panel.appendChild(el('h4', '', 'Keyboard'));
  const keys = button('<span class="lbl">Key bindings</span><span class="val"><b>›</b></span>', () => app.openKeys(), 'setrow');
  panel.appendChild(keys);
  panel.appendChild(el('h4', '', 'Graphics'));
  add('Quality', () => ({ low: 'Low', medium: 'Medium', high: 'High' }[settings.quality]), cycle('quality', ['low', 'medium', 'high'], () => app.game.applyQuality()));
  panel.appendChild(el('h4', '', 'Data'));
  panel.appendChild(button('Reset progress', () => app.openConfirmReset(), 'setrow danger'));
  return { el: root, autofocus: panel.querySelector('.fx'), onBack: () => app.openMainMenu() };
}

export function keysScreen(app) {
  const root = el('div', 'scr scr-settings');
  const header = el('div', 'bar-top');
  const back = button('<span class="chev">‹</span>', () => app.openSettings(), 'icon back');
  header.append(back, el('h2', '', 'Key bindings'), el('div'));
  root.appendChild(header);
  const panel = el('div', 'panel list');
  root.appendChild(panel);
  const say = note(root);
  const RESERVED = ['Escape', 'Enter', 'NumpadEnter', 'Backspace', 'KeyP'];
  const ACTIONS = [['left', 'Steer left'], ['right', 'Steer right'], ['brake', 'Brake']];
  panel.appendChild(el('p', 'hintline', 'Pick a slot, then press the key you want. Esc, Enter, Backspace and P are reserved for menus.'));

  function build() {
    panel.querySelectorAll('.keyrow').forEach((r) => r.remove());
    for (const [action, label] of ACTIONS) {
      const row = el('div', 'keyrow');
      row.appendChild(el('span', 'lbl', label));
      for (let slot = 0; slot < 2; slot++) {
        const code = settings.keys[action][slot];
        const b = button(code ? keyName(code) : '—', () => rebind(action, slot, b), 'keybtn');
        row.appendChild(b);
      }
      panel.appendChild(row);
    }
    // keep reset button last
    panel.appendChild(reset);
  }

  function rebind(action, slot, btn) {
    btn.textContent = 'Press a key…';
    btn.classList.add('listening');
    app.input.keyboard.captureNext((code) => {
      if (RESERVED.includes(code)) { say(`${keyName(code)} is reserved for menus`); return build2(btn); }
      // another action must keep at least one key
      for (const other of Object.keys(settings.keys)) {
        if (other === action) continue;
        const arr = settings.keys[other];
        if (arr.includes(code) && arr.length === 1) { say(`That is the only key for ${other}`); return build2(btn); }
      }
      for (const other of Object.keys(settings.keys)) settings.keys[other] = settings.keys[other].filter((k) => k !== code || other === action);
      const mine = settings.keys[action];
      const old = mine[slot];
      if (slot < mine.length) mine[slot] = code; else mine.push(code);
      if (old === code) mine.splice(slot, 1, code);
      settings.keys[action] = [...new Set(mine)].slice(0, 2);
      save();
      audio.click();
      build2(btn);
    });
  }
  const build2 = () => { const idx = app.ui.list().indexOf(app.ui.focused); build(); const l = app.ui.list(); app.ui.refocus(l[Math.max(0, idx)] || l[0]); };

  const reset = button('Reset to defaults', () => {
    settings.keys = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], brake: ['Space', 'KeyS', 'ArrowDown'] };
    save(); build2();
  }, 'setrow');
  build();
  return { el: root, autofocus: panel.querySelector('.keybtn'), onBack: () => { app.input.keyboard.capture = null; app.openSettings(); } };
}

export function confirmReset(app) {
  const root = el('div', 'scr scr-pause');
  root.appendChild(el('h2', '', 'Reset progress?'));
  root.appendChild(el('div', 'meta', 'This erases all stars, best times, Grand Prix results, ghosts, unlocks and garage choices.<br>Settings are kept.'));
  const list = el('div', 'stack');
  const no = button('No, keep my progress', () => app.openSettings(), 'primary');
  const yes = button('Yes, erase everything', () => app.resetProgress(), 'danger');
  list.append(no, yes);
  root.appendChild(list);
  return { el: root, autofocus: no, onBack: () => app.openSettings() };
}

// ------------------------------------------------------------------ garage
export function garageScreen(app) {
  const root = el('div', 'scr scr-garage');
  const header = el('div', 'bar-top');
  const back = button('<span class="chev">‹</span>', () => app.openMainMenu(), 'icon back');
  header.append(back, el('h2', '', 'Garage'), el('div', 'total', `<span class="st on">★</span> ${career.totalStars()}`));
  root.appendChild(header);
  const sheet = el('div', 'sheet');
  root.appendChild(sheet);
  const say = note(root);

  let viewId = garage.selectedCar().id;
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  function render(focusSel = null) {
    const car = garage.carById(viewId);
    const unlocked = garage.carUnlocked(car);
    const chosen = garage.selectedCar().id === car.id;
    sheet.innerHTML = '';
    const tabs = el('div', 'tabs cars');
    CARS.forEach((c) => {
      const lock = !garage.carUnlocked(c);
      const t = button(`${c.name}${lock ? LOCK : ''}`, () => { viewId = c.id; render('tab' + c.id); }, `tab${c.id === viewId ? ' sel' : ''}${lock ? ' locked' : ''}`);
      t.dataset.sel = 'tab' + c.id;
      tabs.appendChild(t);
    });
    sheet.appendChild(tabs);
    sheet.appendChild(el('p', 'blurb', car.blurb));
    const bars = garage.statBars(car);
    const sb = el('div', 'bars');
    for (const [k, v] of Object.entries(bars)) sb.appendChild(el('div', '', `<span>${k}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`));
    sheet.appendChild(sb);

    const paints = el('div', 'paints');
    const options = [{ id: 'default', name: 'Original', color: car.color }, ...REWARD_COLORS];
    const cur = garage.selectedPaint();
    options.forEach((p, i) => {
      const ok = garage.paintUnlocked(p.id);
      const b = button(ok ? '' : LOCK, () => { garage.setPaint(p.id); app.previewGarage(viewId); render('paint' + p.id); }, `swatch${cur === p.id ? ' on' : ''}${ok ? '' : ' disabled'}`);
      b.style.background = hex(i === 0 ? car.color : p.color);
      b.dataset.sel = 'paint' + p.id;
      b.title = i === 0 ? 'Original' : p.name;
      b.addEventListener('denied', () => say(`Win a Grand Prix on ${DIFFICULTIES[i - 1].name} to unlock ${p.name}`));
      paints.appendChild(b);
    });
    sheet.appendChild(paints);

    let action;
    if (!unlocked) {
      const have = Math.min(career.totalStars(), car.starsToUnlock);
      sheet.appendChild(el('div', 'unlock', `<div class="bar"><i style="width:${(have / car.starsToUnlock) * 100}%"></i></div><p>${LOCK} ${have} / ${car.starsToUnlock} career stars to unlock</p>`));
      action = button('Locked', null); action.classList.add('disabled');
      action.addEventListener('denied', () => say(`Collect ${car.starsToUnlock} stars in Career to unlock ${car.name}`));
    } else if (chosen) {
      action = button('Selected ✓', null); action.classList.add('disabled');
    } else {
      action = button('Select', () => { garage.setCar(car.id); app.game.applyLoadout(); render('action'); }, 'primary');
    }
    action.dataset.sel = 'action';
    sheet.appendChild(action);

    app.previewGarage(viewId);
    const target = focusSel ? sheet.querySelector(`[data-sel="${focusSel}"]`) : null;
    if (root.isConnected) app.ui.refocus(target || action);
  }
  render();
  return { el: root, autofocus: sheet.querySelector('[data-sel="action"]'), onBack: () => app.openMainMenu() };
}

// ------------------------------------------------------------------ loss (left the road)
const TIPS = [
  'Steer hard to start a drift, then counter-steer to hold the angle.',
  'Too much angle spins you out. Brake to pull the car back in line.',
  'Brake early for very tight corners. Slower is better than off the road.',
  'Ease off the steering as the corner opens up to straighten the drift.',
  'Watch the red glow at the screen edge: it means the road edge is close.',
];
let tipIndex = 0;

/** Count a number up from 0 with an ease-out, starting after `delay` ms. */
function countUp(node, to, fmt, delay, duration = 900) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = fmt(to); return; }
  node.textContent = fmt(0);
  setTimeout(() => {
    const t0 = performance.now();
    const tick = (now) => {
      if (!node.isConnected) return;
      const k = Math.min(1, (now - t0) / duration);
      node.textContent = fmt(to * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

/**
 * Shown after the crash replay. info: { time, driftScore, progress (0..1), lap, laps, best (seconds|undefined) }
 * ctx: { title (track name), mode ('Career' | 'Grand Prix · Pro'), retry(), menu() }
 */
export function lossScreen(app, info, ctx) {
  const root = el('div', 'scr scr-loss');
  const pct = Math.round(info.progress * 100);
  const word = 'OFF THE ROAD'.split(' ').map((w) => w.split('').map((ch) => ch).join(''));
  let n = 0;
  const letters = word.map((w) => `<span class="word">${[...w].map((ch) => `<span class="ltr" style="--i:${n++}">${ch}</span>`).join('')}</span>`).join(' ');
  root.innerHTML = `
    <div class="loss-vignette"></div>
    <div class="loss-card">
      <div class="loss-kicker">${ctx.mode} · ${ctx.title}</div>
      <h1 class="loss-title" aria-label="Off the road">${letters}</h1>
      <div class="loss-sub">You left the track${info.laps > 1 ? ` on lap ${info.lap} of ${info.laps}` : ''}.</div>
      <div class="loss-meter" style="--p:${pct}%">
        <div class="loss-track"><i class="loss-fill"></i><b class="loss-x">✕</b></div>
        <span class="loss-pct">0%</span> <small>of the race</small>
      </div>
      <div class="loss-stats">
        <div><small>Time</small><b class="c-time">0.00</b></div>
        <div><small>Drift score</small><b class="c-drift">0</b></div>
        ${info.best !== undefined ? `<div><small>Best</small><b>${fmtTime(info.best)}</b></div>` : ''}
      </div>
      <div class="loss-tip">${TIPS[tipIndex++ % TIPS.length]}</div>
    </div>`;
  const actions = el('div', 'row loss-actions');
  const retry = button('Retry', () => ctx.retry(), 'primary pulse');
  const menu = button('Menu', () => ctx.menu());
  actions.append(retry, menu);
  root.appendChild(actions);

  countUp(root.querySelector('.loss-pct'), pct, (v) => `${Math.round(v)}%`, 750, 1100);
  countUp(root.querySelector('.c-time'), info.time, (v) => fmtTime(v), 1000);
  countUp(root.querySelector('.c-drift'), info.driftScore, (v) => fmtScore(v), 1100);
  setTimeout(() => { if (root.isConnected) audio.lossSting(); }, 350);
  return { el: root, autofocus: retry, onBack: () => ctx.menu() };
}
