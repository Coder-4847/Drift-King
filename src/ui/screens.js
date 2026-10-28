// Menu screens. Each function returns a screen object for UI.open().

import { el, button } from './UI.js';
import { CHAPTERS } from '../data/chapters.js';
import { fmtTime, fmtScore } from '../util/format.js';
import * as career from '../game/career.js';
import * as gp from '../game/gp.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { REWARD_COLORS } from '../data/cars.js';
import { specOf, gpTracks, getTrackDef } from '../tracks/trackDefs.js';
import { Track } from '../tracks/Track.js';
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
  const comingSoon = (label) => { const b = button(`${label}<small>soon</small>`, null); b.classList.add('disabled'); return b; };
  list.append(career_, button('Grand Prix', () => app.openGpSelect()), comingSoon('Garage'), comingSoon('Settings'));
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
    </div>`;
  const actions = el('div', 'row');
  const retry = button('Retry', () => app.startCareerRace(lvl.id));
  const nextB = button('Next', () => app.openPreRace(next.id), 'primary');
  if (!next) nextB.classList.add('disabled');
  const menu = button('Menu', () => app.openLevelSelect(lvl.chapter, lvl.level));
  actions.append(retry, nextB, menu);
  root.appendChild(actions);
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
  return { el: root, autofocus: nextId ? next : retry, onBack: () => app.openGpSelect(diff, trackId) };
}
